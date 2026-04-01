import React from 'react';
import { render, screen } from '@testing-library/react';
import { ToolErrorBoundary } from './ToolErrorBoundary';

function CrashingTool(): React.JSX.Element {
  throw new Error('broken payload');
  return <></>;
}

describe('ToolErrorBoundary', () => {
  it('shows a fallback and keeps surrounding chat content mounted', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <div>
        <span>Chat still mounted</span>
        <ToolErrorBoundary
          toolName="search_emails"
          errorLabel="Errore rendering"
          fallbackMessage="Impossibile mostrare questo tool."
        >
          <CrashingTool />
        </ToolErrorBoundary>
      </div>,
    );

    expect(screen.getByText('Chat still mounted')).toBeInTheDocument();
    expect(screen.getByText('search_emails')).toBeInTheDocument();
    expect(screen.getByText('Errore rendering')).toBeInTheDocument();
    expect(screen.getByText('Impossibile mostrare questo tool. broken payload')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
