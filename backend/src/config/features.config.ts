import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Ensure environment variables are loaded when this module is imported.
const envFiles = ['.env', '.env.development', '.env.production', '../.env', '../../.env'];
for (const envFile of envFiles) {
  const resolved = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved });
  }
}

export interface FeatureToggleConfig {
  enabled: boolean;
  rolloutPercentage: number;
  allowedTenants: string[];
}

export interface FeaturesConfig {
  [featureName: string]: FeatureToggleConfig;
  userLabels: FeatureToggleConfig;
}

const normalizeBoolean = (value?: string): boolean =>
  ['1', 'true', 'on', 'yes'].includes((value || '').toLowerCase());

const normalizePercentage = (value?: string): number => {
  const parsed = Number.parseInt(value || '0', 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
};

const parseTenantList = (value?: string): string[] =>
  (value || '')
    .split(',')
    .map((tenant) => tenant.trim())
    .filter(Boolean);

export const featuresConfig: FeaturesConfig = {
  userLabels: {
    enabled: normalizeBoolean(process.env.FEATURE_USER_LABELS),
    rolloutPercentage: normalizePercentage(process.env.FEATURE_USER_LABELS_ROLLOUT),
    allowedTenants: parseTenantList(process.env.FEATURE_USER_LABELS_TENANTS),
  },
};

export type FeatureFlagName = keyof typeof featuresConfig;

export const getFeatureFlagConfig = (feature: FeatureFlagName): FeatureToggleConfig | undefined => {
  return featuresConfig[feature];
};
