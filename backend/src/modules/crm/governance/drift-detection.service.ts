import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface DriftResult {
  feature: string;
  psi: number;
  status: 'stable' | 'warning' | 'critical';
  baselineN: number;
  currentN: number;
  checkedAt: string;
}

/**
 * Computes Population Stability Index (PSI) to detect data drift.
 *
 * PSI < 0.1  → stable (no significant drift)
 * PSI 0.1-0.2 → warning (moderate drift, monitor)
 * PSI > 0.2  → critical (significant drift, consider retraining)
 *
 * Splits feature values into 10 equal-width bins and compares
 * baseline (older half) vs current (newer half) distributions.
 */
@Injectable()
export class DriftDetectionService {
  private readonly logger = new Logger(DriftDetectionService.name);

  private static readonly PSI_WARNING = 0.1;
  private static readonly PSI_CRITICAL = 0.2;
  private static readonly MIN_SAMPLES = 50;
  private static readonly NUM_BINS = 10;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run drift detection for lead scoring features.
   * Compares oldest 50% of feature records (baseline) vs newest 50% (current).
   */
  async checkLeadScoringDrift(tenantId: string): Promise<DriftResult[]> {
    const features = await this.prisma.leadFeatureStore.findMany({
      where: { tenantId },
      orderBy: { computedAt: 'asc' },
      select: { features: true, computedAt: true },
    });

    if (features.length < DriftDetectionService.MIN_SAMPLES * 2) {
      return [];
    }

    const mid = Math.floor(features.length / 2);
    const baseline = features.slice(0, mid);
    const current = features.slice(mid);

    // Extract numeric features from the JSON
    const featureNames = this.extractNumericFeatureNames(
      baseline[0]?.features as Record<string, unknown>,
    );

    const results: DriftResult[] = [];
    const now = new Date().toISOString();

    for (const name of featureNames) {
      const baselineVals = this.extractValues(baseline, name);
      const currentVals = this.extractValues(current, name);

      if (baselineVals.length < 10 || currentVals.length < 10) continue;

      const psi = this.computePSI(baselineVals, currentVals);
      const status = this.psiToStatus(psi);

      results.push({
        feature: name,
        psi: Math.round(psi * 1000) / 1000,
        status,
        baselineN: baselineVals.length,
        currentN: currentVals.length,
        checkedAt: now,
      });

      // Persist to DB
      await this.prisma.driftCheck.create({
        data: {
          tenantId,
          modelType: 'lead_scoring',
          feature: name,
          psi,
          status,
          baselineN: baselineVals.length,
          currentN: currentVals.length,
        },
      });
    }

    return results.sort((a, b) => b.psi - a.psi);
  }

  /**
   * Get the most recent drift check results for a tenant.
   */
  async getLatestDriftResults(tenantId: string): Promise<DriftResult[]> {
    // Get the latest checkedAt timestamp per modelType
    const latest = await this.prisma.driftCheck.findFirst({
      where: { tenantId },
      orderBy: { checkedAt: 'desc' },
      select: { checkedAt: true },
    });

    if (!latest) return [];

    const checks = await this.prisma.driftCheck.findMany({
      where: {
        tenantId,
        checkedAt: latest.checkedAt,
      },
      orderBy: { psi: 'desc' },
    });

    return checks.map((c) => ({
      feature: c.feature,
      psi: Math.round(c.psi * 1000) / 1000,
      status: c.status as 'stable' | 'warning' | 'critical',
      baselineN: c.baselineN,
      currentN: c.currentN,
      checkedAt: c.checkedAt.toISOString(),
    }));
  }

  /**
   * Compute PSI between two distributions.
   * Uses equal-width binning across the combined range.
   */
  private computePSI(baseline: number[], current: number[]): number {
    const allVals = [...baseline, ...current];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);

    if (max === min) return 0; // No variance, no drift

    const bins = DriftDetectionService.NUM_BINS;
    const binWidth = (max - min) / bins;

    const baseCounts = new Array(bins).fill(0);
    const currCounts = new Array(bins).fill(0);

    for (const v of baseline) {
      const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      baseCounts[idx]++;
    }
    for (const v of current) {
      const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      currCounts[idx]++;
    }

    // Convert to proportions with Laplace smoothing (avoid log(0))
    const epsilon = 1e-4;
    let psi = 0;
    for (let i = 0; i < bins; i++) {
      const p = baseCounts[i] / baseline.length + epsilon;
      const q = currCounts[i] / current.length + epsilon;
      psi += (q - p) * Math.log(q / p);
    }

    return Math.max(0, psi);
  }

  private psiToStatus(psi: number): 'stable' | 'warning' | 'critical' {
    if (psi >= DriftDetectionService.PSI_CRITICAL) return 'critical';
    if (psi >= DriftDetectionService.PSI_WARNING) return 'warning';
    return 'stable';
  }

  /**
   * Extract all numeric leaf paths from a nested JSON object.
   * E.g. { engagement: { emailReplies: 5 } } → ['engagement.emailReplies']
   */
  private extractNumericFeatureNames(
    obj: Record<string, unknown> | null,
    prefix = '',
  ): string[] {
    if (!obj || typeof obj !== 'object') return [];
    const names: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'number') {
        names.push(path);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        names.push(
          ...this.extractNumericFeatureNames(value as Record<string, unknown>, path),
        );
      }
    }
    return names;
  }

  /**
   * Extract numeric values for a dotted path from feature JSON records.
   */
  private extractValues(
    records: Array<{ features: unknown }>,
    path: string,
  ): number[] {
    const parts = path.split('.');
    const values: number[] = [];
    for (const r of records) {
      let obj: unknown = r.features;
      for (const part of parts) {
        if (obj && typeof obj === 'object') {
          obj = (obj as Record<string, unknown>)[part];
        } else {
          obj = undefined;
          break;
        }
      }
      if (typeof obj === 'number' && Number.isFinite(obj)) {
        values.push(obj);
      }
    }
    return values;
  }
}
