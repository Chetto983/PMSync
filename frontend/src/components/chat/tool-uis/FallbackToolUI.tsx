'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { Code, Loader2 } from 'lucide-react';

/**
 * Catch-all fallback for unregistered tools.
 * Shows tool name, running indicator, and collapsible JSON of args/result.
 *
 * Registered with toolName "*" which assistant-ui uses as the wildcard matcher.
 */
export const FallbackToolUI = makeAssistantToolUI<unknown, unknown>({
  toolName: '*',
  render: ({ status, toolName, args, result }) => {
    const isRunning = status.type === 'running';

    return (
      <div className="chat-tool-fallback text-sm">
        <div className="chat-tool-fallback-header">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
          ) : (
            <Code className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="chat-tool-fallback-name">
            {toolName}
          </span>
          <span className="chat-tool-fallback-status">
            {isRunning ? 'Running' : 'Complete'}
          </span>
        </div>
        <details className="mt-2">
          <summary className="chat-tool-fallback-summary">
            {isRunning ? 'Arguments' : 'Details'}
          </summary>
          <div className="mt-1 space-y-1">
            {args != null && (
              <pre className="chat-tool-fallback-pre">
                {JSON.stringify(args, null, 2)}
              </pre>
            )}
            {result != null && (
              <pre className="chat-tool-fallback-pre">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </details>
      </div>
    );
  },
});
