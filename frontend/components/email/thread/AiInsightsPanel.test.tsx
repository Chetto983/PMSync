import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { AiInsightsPanel } from './AiInsightsPanel';

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    threadMessage: {
      ai: {
        priority: 'Priorità',
        positive: 'Positivo',
        negative: 'Negativo',
        neutral: 'Neutrale',
        mixed: 'Misto',
      },
    },
  }),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'it' }),
}));

describe('AiInsightsPanel', () => {
  it('shows italian panel copy and replaces english stored reasons', () => {
    render(
      <ThemeProvider theme={createTheme()}>
        <AiInsightsPanel
          showSummary={false}
          summary={null}
          priority={1}
          priorityReason="The email reports a critical CI failure that requires immediate attention."
          sentiment="negative"
          labels={['Updates']}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Insight AI')).toBeInTheDocument();
    expect(screen.getByText(/alta priorità/i)).toBeInTheDocument();
    expect(screen.getByText(/avviso di sistema/i)).toBeInTheDocument();
    expect(screen.queryByText(/The email reports/i)).not.toBeInTheDocument();
  });
});
