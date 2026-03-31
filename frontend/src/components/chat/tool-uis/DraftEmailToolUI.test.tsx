import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DraftEmailRenderer } from './DraftEmailToolUI';

const mockPush = jest.fn();
const mockOpenDraft = jest.fn();
const mockAddResult = jest.fn();
const mockResume = jest.fn();

jest.mock('next/router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    ai: {
      toolUi: {
        draftSaved: 'Bozza salvata',
        to: 'A: {value}',
        openInEditor: "Apri nell'editor",
      },
    },
  }),
}));

jest.mock('@/stores/email-ui-store', () => ({
  useEmailUIStore: (selector: (state: { openDraft: typeof mockOpenDraft }) => unknown) =>
    selector({ openDraft: mockOpenDraft }),
}));

describe('DraftEmailRenderer', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockOpenDraft.mockClear();
    mockAddResult.mockClear();
    mockResume.mockClear();
  });

  it('navigates to the compose editor for the saved draft', () => {
    render(
      <DraftEmailRenderer
        type="tool-call"
        toolCallId="tool-call-1"
        toolName="draft_email"
        args={{ to: 'dvdmarchetto@gmail.com', subject: 'AI Tool Draft', body: 'Body' }}
        argsText='{"to":"dvdmarchetto@gmail.com"}'
        result={{ id: 'draft-123', to: 'dvdmarchetto@gmail.com', subject: 'AI Tool Draft', status: 'draft' }}
        status={{ type: 'complete' } as never}
        addResult={mockAddResult}
        resume={mockResume}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /apri nell'editor/i }));

    expect(mockOpenDraft).toHaveBeenCalledWith('draft-123');
    expect(mockPush).toHaveBeenCalledWith('/dashboard/email/compose?draftId=draft-123');
  });

  it('does not render the editor button when the draft id is missing', () => {
    render(
      <DraftEmailRenderer
        type="tool-call"
        toolCallId="tool-call-2"
        toolName="draft_email"
        args={{ to: 'dvdmarchetto@gmail.com', subject: 'AI Tool Draft', body: 'Body' }}
        argsText='{"to":"dvdmarchetto@gmail.com"}'
        result={{ to: 'dvdmarchetto@gmail.com', subject: 'AI Tool Draft', status: 'draft' }}
        status={{ type: 'complete' } as never}
        addResult={mockAddResult}
        resume={mockResume}
      />,
    );

    expect(screen.queryByRole('button', { name: /apri nell'editor/i })).not.toBeInTheDocument();
  });
});
