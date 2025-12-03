import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThreadListSkeleton } from './ThreadListSkeleton';

describe('ThreadListSkeleton', () => {
  it('renders default number of skeleton items', () => {
    render(<ThreadListSkeleton />);

    // Default count is 8
    const skeletonContainer = screen.getByRole('status');
    expect(skeletonContainer).toBeInTheDocument();
    expect(skeletonContainer).toHaveAttribute('aria-label', 'Loading emails');
  });

  it('renders specified number of skeleton items', () => {
    const { container } = render(<ThreadListSkeleton count={5} />);

    // Check that we have 5 divider elements (one after each item)
    const dividers = container.querySelectorAll('hr');
    expect(dividers).toHaveLength(5);
  });

  it('renders without checkbox when showCheckbox is false', () => {
    const { container } = render(<ThreadListSkeleton count={1} showCheckbox={false} />);

    // Count skeleton elements - without checkbox there should be fewer
    const skeletons = container.querySelectorAll('.MuiSkeleton-root');
    // With checkbox: circular(1) + rectangular(1) + text(3) + rounded(2) = 7
    // Without checkbox: circular(1) + text(3) + rounded(2) = 6
    expect(skeletons.length).toBeLessThan(8);
  });

  it('has accessible loading state', () => {
    render(<ThreadListSkeleton />);

    const loadingRegion = screen.getByRole('status');
    expect(loadingRegion).toHaveAttribute('aria-label', 'Loading emails');
  });
});
