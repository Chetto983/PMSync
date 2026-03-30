import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { HIGH_RISK_TOOLS, HitlApprovalWrapper } from './HitlApprovalCard';

const mockAddToolApprovalResponse = jest.fn();

jest.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({
    chat: {
      hitl: {
        approvedChip: 'APPROVATO',
        deniedChip: 'RIFIUTATO',
        pendingTitle: 'Approval required',
        highChip: 'HIGH',
        approveLabel: 'Approva',
        rejectLabel: 'Nega',
        viewParameters: 'Vedi parametri',
      },
    },
  }),
}));

jest.mock('./ChatRuntimeProvider', () => ({
  getAddToolApprovalResponse: () => mockAddToolApprovalResponse,
}));

describe('HitlApprovalWrapper', () => {
  beforeEach(() => {
    mockAddToolApprovalResponse.mockClear();
  });

  it('renders a rejected terminal state after deny even if the card remounts without result data', () => {
    const addResult = jest.fn();
    const first = render(
      <HitlApprovalWrapper
        status={{ type: 'requires-action', reason: 'interrupt' }}
        addResult={addResult}
        toolCallId="tc-deny-remount"
        toolName="send_email"
        args={{ to: 'dvdmarchetto@gmail.com', subject: 'Subject' }}
        interrupt={{ type: 'human', payload: { id: 'approval-1' } }}
      />,
    );

    fireEvent.click(screen.getByTestId('hitl-deny'));

    expect(mockAddToolApprovalResponse).toHaveBeenCalledWith({
      id: 'approval-1',
      approved: false,
      reason: 'User rejected',
    });

    first.unmount();

    render(
      <HitlApprovalWrapper
        status={{ type: 'complete' }}
        addResult={addResult}
        toolCallId="tc-deny-remount"
        toolName="send_email"
        args={{ to: 'dvdmarchetto@gmail.com', subject: 'Subject' }}
      />,
    );

    expect(screen.getByTestId('hitl-rejected')).toBeInTheDocument();
    expect(screen.queryByTestId('hitl-approved')).not.toBeInTheDocument();
  });

  it('renders rejected when the completed tool result reports approval denied', () => {
    render(
      <HitlApprovalWrapper
        status={{ type: 'complete' }}
        addResult={jest.fn()}
        toolCallId="tc-output-denied"
        toolName="delete_email"
        args={{ emailId: '123' }}
        result={{ error: 'Tool approval denied' }}
      />,
    );

    expect(screen.getByTestId('hitl-rejected')).toBeInTheDocument();
  });

  it('treats delete_memory as a high-risk terminal-state tool', () => {
    expect(HIGH_RISK_TOOLS.has('delete_memory')).toBe(true);
  });
});
