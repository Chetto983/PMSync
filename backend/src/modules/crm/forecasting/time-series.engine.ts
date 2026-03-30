/**
 * Pure TypeScript time series forecasting engine.
 * Implements: moving average (window=3), linear trend extraction,
 * additive seasonal decomposition, and confidence interval estimation.
 *
 * No external ML dependencies — runs in any Node.js process.
 */

export interface TimeSeriesPoint {
  /** Period index (0-based) */
  index: number;
  /** Actual observed value */
  value: number;
}

export interface ForecastPoint {
  /** Period index (continues from last observed) */
  index: number;
  /** Predicted value (p50) */
  predicted: number;
  /** 20th percentile (pessimistic) */
  p20: number;
  /** 50th percentile (median, same as predicted) */
  p50: number;
  /** 80th percentile (optimistic) */
  p80: number;
}

export interface ForecastResult {
  forecasts: ForecastPoint[];
  /** Mean Absolute Error on in-sample data */
  mae: number;
  /** Method used: 'seasonal' | 'trend' | 'average' */
  method: string;
}

const MA_WINDOW = 3;
const MIN_SEASONAL_PERIODS = 6;

/**
 * Simple moving average over a window of size `w`.
 */
function movingAverage(values: number[], w: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - w + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

/**
 * Ordinary least squares linear regression.
 * Returns [slope, intercept].
 */
function linearRegression(values: number[]): [number, number] {
  const n = values.length;
  if (n === 0) return [0, 0];
  if (n === 1) return [0, values[0]];

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return [0, sumY / n];

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return [slope, intercept];
}

/**
 * Extract additive seasonal component.
 * seasonLength = number of periods in one cycle (e.g., 12 for monthly with yearly seasonality).
 */
function extractSeasonal(
  values: number[],
  trend: number[],
  seasonLength: number,
): number[] {
  // Detrend: residuals = values - trend
  const residuals = values.map((v, i) => v - trend[i]);

  // Average residuals by season position
  const seasonAvg = new Array(seasonLength).fill(0);
  const seasonCount = new Array(seasonLength).fill(0);

  for (let i = 0; i < residuals.length; i++) {
    const pos = i % seasonLength;
    seasonAvg[pos] += residuals[i];
    seasonCount[pos] += 1;
  }

  for (let i = 0; i < seasonLength; i++) {
    seasonAvg[i] =
      seasonCount[i] > 0 ? seasonAvg[i] / seasonCount[i] : 0;
  }

  // Center the seasonal component (subtract mean so it sums to ~0)
  const mean = seasonAvg.reduce((a, b) => a + b, 0) / seasonLength;
  for (let i = 0; i < seasonLength; i++) {
    seasonAvg[i] -= mean;
  }

  // Expand to full series length
  return values.map((_, i) => seasonAvg[i % seasonLength]);
}

/**
 * Compute residual standard deviation for confidence intervals.
 */
function residualStd(
  actual: number[],
  predicted: number[],
): number {
  if (actual.length <= 2) return 0;
  const residuals = actual.map((v, i) => v - predicted[i]);
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const variance =
    residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (residuals.length - 1);
  return Math.sqrt(variance);
}

/**
 * Generate forecast for `horizonPeriods` ahead from `data`.
 *
 * @param data - Array of observed values (chronologically ordered, evenly spaced)
 * @param horizonPeriods - Number of future periods to forecast
 * @param seasonLength - Length of seasonal cycle (12 for monthly data with yearly pattern)
 */
export function forecast(
  data: number[],
  horizonPeriods: number,
  seasonLength = 12,
): ForecastResult {
  if (data.length === 0) {
    return {
      forecasts: Array.from({ length: horizonPeriods }, (_, i) => ({
        index: i,
        predicted: 0,
        p20: 0,
        p50: 0,
        p80: 0,
      })),
      mae: 0,
      method: 'average',
    };
  }

  // If very few data points, use simple average
  if (data.length < 3) {
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    return {
      forecasts: Array.from({ length: horizonPeriods }, (_, i) => ({
        index: data.length + i,
        predicted: Math.max(0, avg),
        p20: Math.max(0, avg * 0.5),
        p50: Math.max(0, avg),
        p80: avg * 1.5,
      })),
      mae: 0,
      method: 'average',
    };
  }

  // Step 1: Moving average to smooth noise
  const smoothed = movingAverage(data, MA_WINDOW);

  // Step 2: Extract linear trend
  const [slope, intercept] = linearRegression(smoothed);
  const trendLine = data.map((_, i) => intercept + slope * i);

  // Step 3: Seasonal decomposition (only if enough data)
  const useSeasonal =
    data.length >= MIN_SEASONAL_PERIODS && seasonLength > 1;

  let seasonal: number[] | null = null;
  let method = 'trend';

  if (useSeasonal) {
    seasonal = extractSeasonal(data, trendLine, seasonLength);
    method = 'seasonal';
  }

  // In-sample fitted values
  const fitted = data.map((_, i) => {
    let val = trendLine[i];
    if (seasonal) val += seasonal[i];
    return val;
  });

  // Residual std for confidence bands
  const sigma = residualStd(data, fitted);

  // MAE on in-sample
  const mae =
    data.reduce((sum, v, i) => sum + Math.abs(v - fitted[i]), 0) /
    data.length;

  // Step 4: Project forward
  const n = data.length;
  const forecasts: ForecastPoint[] = [];

  for (let h = 0; h < horizonPeriods; h++) {
    const futureIdx = n + h;
    let predicted = intercept + slope * futureIdx;

    if (seasonal) {
      predicted += seasonal[futureIdx % seasonLength];
    }

    // Widen confidence band with horizon distance
    const horizonFactor = Math.sqrt(1 + h);
    const p20 = predicted - 1.28 * sigma * horizonFactor;
    const p80 = predicted + 1.28 * sigma * horizonFactor;

    forecasts.push({
      index: futureIdx,
      predicted: Math.max(0, predicted),
      p20: Math.max(0, p20),
      p50: Math.max(0, predicted),
      p80: Math.max(0, p80),
    });
  }

  return { forecasts, mae, method };
}
