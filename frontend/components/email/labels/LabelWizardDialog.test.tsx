import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LabelWizardDialog } from './LabelWizardDialog';

const mockUseLabelWizardOptions = jest.fn();
const mockUseLabels = jest.fn();
const mockUseCreateLabelWizard = jest.fn();
const mockUseUpdateLabelWizard = jest.fn();
const mockUseEmails = jest.fn();
const mockUseWizardLabelPreview = jest.fn();

jest.mock('@/lib/api/labels', () => ({
  labelColorToHex: (color?: { backgroundColor?: string } | null) => color?.backgroundColor || '#9E9E9E',
  hexToLabelColor: (hex: string) => ({ backgroundColor: hex, textColor: '#ffffff' }),
}));

jest.mock('@/hooks/queries', () => ({
  useLabelWizardOptions: () => mockUseLabelWizardOptions(),
  useLabels: () => mockUseLabels(),
  useCreateLabelWizard: () => mockUseCreateLabelWizard(),
  useUpdateLabelWizard: () => mockUseUpdateLabelWizard(),
  useEmails: (...args: unknown[]) => mockUseEmails(...args),
  useWizardLabelPreview: (...args: unknown[]) => mockUseWizardLabelPreview(...args),
}));

jest.mock('@/lib/hooks/use-locale', () => ({
  useLocale: () => ({ locale: 'it', changeLocale: jest.fn() }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    email: {
      labels: {
        wizard: {
          title: 'Crea etichetta',
          editTitle: 'Modifica etichetta',
          subtitle: 'subtitle',
          stepName: 'Nome e colore',
          stepClassify: 'Classificazione',
          stepBehavior: 'Comportamento',
          stepReview: 'Riepilogo',
          nameLabel: 'Nome etichetta',
          namePlaceholder: 'placeholder',
          colorLabel: 'Colore',
          categoryLabel: 'Categoria',
          categoryWorkflow: 'Operativa',
          categorySemantic: 'Semantica',
          categorySuppression: 'Soppressione',
          categoryCustom: 'Personalizzata',
          whoSends: 'Chi invia queste email?',
          whoSendsHelp: 'help',
          whatContains: 'Cosa contengono queste email?',
          whatContainsHelp: 'help',
          roles: {
            tech: 'Tech / IT',
            any: 'Qualsiasi mittente',
          },
          contents: {
            systemAlert: 'Avvisi di sistema',
            newsletter: 'Newsletter',
          },
          actionNeeded: 'Quale azione serve?',
          action: {
            none: 'Nessuna azione necessaria',
            urgent: 'Rispondi entro 24h',
            followup: 'Richiede follow-up',
            decide: 'Richiede una decisione',
          },
          suppressUrgency: 'Sopprimi urgenza',
          suppressUrgencyHelp: 'help',
          conflictsWith: 'In conflitto con',
          conflictsWithHelp: 'help',
          reviewTitle: 'Rivedi la tua etichetta',
          urgencySuppressed: 'Urgenza soppressa',
          generatedPrompt: 'Prompt AI generato',
          editPromptAdvanced: 'Modifica prompt',
          previewTitle: 'Prova su email reale',
          previewDescription: 'Verifica questa bozza su una email recente della inbox prima di salvarla.',
          previewEmailLabel: 'Email campione',
          previewSelectedEmail: 'Email selezionata',
          previewRefresh: 'Aggiorna anteprima',
          previewLoadingEmails: 'Caricamento email recenti della inbox...',
          previewLoading: 'Anteprima live in esecuzione...',
          previewError: 'Errore anteprima',
          previewNoEmailsTitle: 'Nessuna email inbox disponibile.',
          previewNoEmailsDescription: 'description',
          previewNoSubject: '(Senza oggetto)',
          previewMatched: 'Questa bozza di etichetta corrisponde alla email selezionata.',
          previewNotMatched: 'Questa bozza di etichetta non corrisponde ancora alla email selezionata.',
          previewPriority: 'Priorità',
          previewUrgency: 'Urgenza',
          previewLane: 'Lane',
          previewNoLane: 'Nessuna lane',
          previewAppliedLabels: 'Etichette applicate',
          previewNoLabels: 'Nessuna etichetta applicata',
          previewSummary: 'Riassunto',
          previewReasoning: 'Motivazione',
          createLabel: 'Crea etichetta',
          updateLabel: 'Aggiorna etichetta',
          back: 'Indietro',
          next: 'Avanti',
          cancel: 'Annulla',
          emptyTitle: 'empty',
          emptyDescription: 'empty',
          createFirst: 'first',
          nameRequired: 'required',
          nameExists: 'exists',
          rolesRequired: 'roles required',
          contentsRequired: 'contents required',
          actionRequired: 'action required',
          maxLabels: 'max',
        },
      },
    },
  }),
}));

describe('LabelWizardDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    mockUseLabelWizardOptions.mockReturnValue({
      data: {
        roles: ['tech', 'any'],
        contents: ['system-alert', 'newsletter'],
        actions: ['none', 'urgent', 'followup', 'decide'],
      },
    });
    mockUseLabels.mockReturnValue({ data: [] });
    mockUseCreateLabelWizard.mockReturnValue({ isPending: false, mutateAsync: jest.fn() });
    mockUseUpdateLabelWizard.mockReturnValue({ isPending: false, mutateAsync: jest.fn() });
    mockUseEmails.mockReturnValue({
      data: {
        emails: [
          {
            id: 'email-1',
            subject: '[chetto1983/PMSync] Run failed: CI',
            from: 'notifications@github.com',
            isDraft: false,
            isDeleted: false,
          },
        ],
      },
      isPending: false,
    });
    mockUseWizardLabelPreview.mockReturnValue({
      data: {
        matched: true,
        analysis: {
          labels: ['CI Incident', 'Action Items'],
          priority: 4,
          urgency: 'high',
          lane: 'action-now',
          summary: 'CI failure on main branch.',
          reasoning: 'The subject and sender indicate a concrete CI incident.',
        },
      },
      isPending: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('renders live draft preview on the review step using a real inbox email', async () => {
    render(
      <LabelWizardDialog
        open
        onClose={jest.fn()}
        editLabel={{
          id: 'label-1',
          tenantId: 'tenant-1',
          name: 'CI Incident',
          slug: 'ci-incident',
          type: 'USER',
          color: { backgroundColor: '#ff0000', textColor: '#ffffff' },
          icon: null,
          parentId: null,
          level: 0,
          orderIndex: 0,
          isArchived: false,
          aiPrompt: 'Use for CI failures.',
          category: 'workflow',
          roles: ['tech'],
          contents: ['system-alert'],
          actionType: 'urgent',
          suppressUrgency: false,
          mutuallyExclusiveWith: [],
          defaultLane: 'action-now',
          createdAt: '2026-04-02T10:00:00.000Z',
          updatedAt: '2026-04-02T10:00:00.000Z',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));
    fireEvent.click(screen.getByRole('button', { name: 'Avanti' }));

    await screen.findByText('Prova su email reale');
    await screen.findByText('Questa bozza di etichetta corrisponde alla email selezionata.');
    expect(screen.getByText('CI failure on main branch.')).toBeInTheDocument();
    expect(screen.getByText('The subject and sender indicate a concrete CI incident.')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockUseWizardLabelPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          emailId: 'email-1',
          labelId: 'label-1',
          locale: 'it',
          name: 'CI Incident',
        }),
        true,
      );
    });
  });
});
