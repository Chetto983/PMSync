import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CalendarInviteCard } from './CalendarInviteCard';

const mockInvite = {
  uid: 'test-uid',
  method: 'REQUEST' as const,
  sequence: 0,
  summary: 'Team Sync',
  description: 'Weekly team sync',
  location: 'Conference Room',
  startTime: '2025-12-10T14:00:00Z',
  endTime: '2025-12-10T15:00:00Z',
  isAllDay: false,
  timezone: 'UTC',
  organizer: { email: 'organizer@example.com', name: 'Organizer' },
  attendees: [{ email: 'attendee@example.com', name: 'Attendee One' }],
};

describe('CalendarInviteCard', () => {
  it('renders invite details and calls onRespond', async () => {
    const onRespond = jest.fn().mockResolvedValue(undefined);
    render(<CalendarInviteCard invite={mockInvite} status="pending" onRespond={onRespond} />);

    expect(screen.getByText('Team Sync')).toBeInTheDocument();
    expect(screen.getByText(/Conference Room/)).toBeInTheDocument();
    expect(screen.getByText(/Attendee One/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
    });
    expect(onRespond).toHaveBeenCalledWith('accept');
  });

  it('disables actions when cancelled', () => {
    const cancelledInvite = { ...mockInvite, method: 'CANCEL' as const, status: 'CANCELLED' as const };
    render(<CalendarInviteCard invite={cancelledInvite} status="pending" />);

    expect(screen.getAllByText(/Cancelled/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Accept/i })).toBeDisabled();
  });

  it('shows updated badge for higher sequence', () => {
    const updatedInvite = { ...mockInvite, sequence: 2 };
    render(<CalendarInviteCard invite={updatedInvite} status="pending" />);
    expect(screen.getByText(/Updated/i)).toBeInTheDocument();
  });
});
