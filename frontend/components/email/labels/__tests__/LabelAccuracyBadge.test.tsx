/**
 * Phase 148 D-10/D-11/D-12: LabelAccuracyBadge unit tests.
 *
 * Covers green/yellow/red traffic-light thresholds, the learning state,
 * and the silent-fail contract on hook errors / missing labels.
 *
 * Mocks:
 *   - `@/hooks/queries/use-label-accuracy` is mocked with a jest.fn so the
 *     transitive `apiClient → better-auth/react` ESM chain never loads in jsdom.
 *   - `@/lib/hooks/use-translations` returns a deterministic English stub.
 *   - `@/lib/hooks/use-locale` is a no-op.
 *
 * The response shape used in `makeEntry` mirrors `LabelAccuracyResponse` from
 * `@/lib/api/triage-accuracy` 1:1 (type-only — see import-type below).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LabelAccuracyResponse } from '@/lib/api/triage-accuracy';

// Hoist-safe mocks: jest hoists jest.mock calls above imports.
const mockUseLabelAccuracy = jest.fn();
jest.mock('@/hooks/queries/use-label-accuracy', () => ({
  useLabelAccuracy: (...args: unknown[]) => mockUseLabelAccuracy(...args),
  labelAccuracyKeys: { all: ['label-accuracy'], byParams: () => ['label-accuracy', {}] },
  labelAccuracyOptions: () => ({ queryKey: ['label-accuracy', {}], queryFn: jest.fn() }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({ useLocale: () => ({ locale: 'en' }) }));
jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    email: {
      labels: {
        accuracy: {
          pill: { ready: '{percent}%', learning: 'Learning…' },
          tooltip: {
            precision: 'Precision: {value}% (±{ci}% at 95% CI)',
            recall: 'Recall: {value}% (±{ci}% at 95% CI)',
            sampleSize: 'Based on {count} corrections over the last {days} days',
            learning:
              'Not enough corrections yet ({current}/{threshold}). Accuracy tracking starts after {threshold} feedback events.',
          },
        },
      },
    },
  }),
}));

// Import the component AFTER the mocks so its `useLabelAccuracy` call resolves to the stub.
import { LabelAccuracyBadge } from '../LabelAccuracyBadge';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockHook = (
  override: Partial<{
    data: LabelAccuracyResponse | null;
    isLoading: boolean;
    isError: boolean;
  }> = {},
) => {
  mockUseLabelAccuracy.mockReturnValue({
    data: null,
    isLoading: false,
    isError: false,
    ...override,
  });
};

function makeEntry(overrides: {
  labelId?: string;
  f1?: number;
  sampleSize?: number;
  precision?: number;
  recall?: number;
  wilsonPrecLow?: number;
  wilsonPrecHigh?: number;
  wilsonRecLow?: number;
  wilsonRecHigh?: number;
}): LabelAccuracyResponse {
  const {
    labelId = 'L1',
    f1 = 0.9,
    sampleSize = 30,
    precision = 0.9,
    recall = 0.85,
    wilsonPrecLow = 0.8,
    wilsonPrecHigh = 0.95,
    wilsonRecLow = 0.7,
    wilsonRecHigh = 0.95,
  } = overrides;
  return {
    labels: [
      {
        labelId,
        labelName: 'Work',
        labelSlug: 'work',
        windows: {
          '30d': {
            precision,
            recall,
            f1,
            tp: 30,
            fp: 3,
            fn: 5,
            sampleSize,
            wilsonPrecLow,
            wilsonPrecHigh,
            wilsonRecLow,
            wilsonRecHigh,
            state: (sampleSize < 20 ? 'learning' : 'ready') as
              | 'learning'
              | 'ready',
          },
        },
        lastUpdatedAt: new Date().toISOString(),
      },
    ],
    computedAt: new Date().toISOString(),
  };
}

describe('LabelAccuracyBadge', () => {
  afterEach(() => {
    mockUseLabelAccuracy.mockReset();
  });

  it('renders Learning… pill when sampleSize < 20', () => {
    mockHook({ data: makeEntry({ sampleSize: 5 }) });
    wrap(<LabelAccuracyBadge labelId="L1" />);
    expect(screen.getByText('Learning…')).toBeInTheDocument();
  });

  it('renders {percent}% pill when F1 >= 0.85 (green)', () => {
    mockHook({ data: makeEntry({ f1: 0.91 }) });
    wrap(<LabelAccuracyBadge labelId="L1" />);
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  it('renders yellow pill when 0.6 <= F1 < 0.85', () => {
    mockHook({ data: makeEntry({ f1: 0.72 }) });
    wrap(<LabelAccuracyBadge labelId="L1" />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('renders red pill when F1 < 0.6', () => {
    mockHook({ data: makeEntry({ f1: 0.45 }) });
    wrap(<LabelAccuracyBadge labelId="L1" />);
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('renders nothing when hook errors', () => {
    mockHook({ isError: true });
    const { container } = wrap(<LabelAccuracyBadge labelId="L1" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the specific label is missing from response', () => {
    mockHook({ data: makeEntry({ labelId: 'OTHER' }) });
    const { container } = wrap(<LabelAccuracyBadge labelId="L1" />);
    expect(container.firstChild).toBeNull();
  });
});
