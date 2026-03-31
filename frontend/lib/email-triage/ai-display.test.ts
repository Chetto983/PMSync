import {
  getAiPanelTitle,
  getLocalizedAiReason,
  localizeAiLabel,
  resolveEmailAiLocale,
} from './ai-display';

describe('ai-display helpers', () => {
  it('resolves italian locale variants', () => {
    expect(resolveEmailAiLocale('it-IT')).toBe('it');
    expect(resolveEmailAiLocale('en-US')).toBe('en');
  });

  it('localizes known default AI labels for italian UI', () => {
    expect(localizeAiLabel('Important', 'it')).toBe('Importante');
    expect(localizeAiLabel('Updates', 'it')).toBe('Aggiornamenti');
    expect(localizeAiLabel('Custom Label', 'it')).toBe('Custom Label');
  });

  it('returns localized panel titles', () => {
    expect(getAiPanelTitle(true, 'it')).toBe('Insight AI');
    expect(getAiPanelTitle(false, 'it')).toBe('Riepilogo AI');
  });

  it('replaces english stored reasons with an italian fallback', () => {
    const reason = getLocalizedAiReason({
      priority: 1,
      priorityReason: 'The email reports a critical CI failure that requires immediate attention.',
      labels: ['Updates'],
      sentiment: 'negative',
      locale: 'it',
    });

    expect(reason).toContain('alta priorità');
    expect(reason).toContain('avviso di sistema');
    expect(reason).toContain('tono è critico');
  });

  it('preserves already localized reasons', () => {
    const reason = getLocalizedAiReason({
      priority: 2,
      priorityReason: "Questa email richiede attenzione rapida per un follow-up aperto.",
      locale: 'it',
    });

    expect(reason).toBe("Questa email richiede attenzione rapida per un follow-up aperto.");
  });
});
