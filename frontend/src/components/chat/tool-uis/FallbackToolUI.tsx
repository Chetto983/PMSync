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
      <div className="rounded-lg border bg-card p-3 text-sm">
        <div className="flex items-center gap-2 mb-1">
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
          ) : (
            <Code className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {toolName}
          </span>
          {isRunning && (
            <span className="text-xs text-muted-foreground animate-pulse">running...</span>
          )}
        </div>
        <details className="mt-1">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
            {isRunning ? 'Arguments' : 'Details'}
          </summary>
          <div className="mt-1 space-y-1">
            {args != null && (
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-40">
                {JSON.stringify(args, null, 2)}
              </pre>
            )}
            {result != null && (
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-40">
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </details>
      </div>
    );
  },
});
