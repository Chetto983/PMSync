'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { Brain, AlertTriangle, Tag } from 'lucide-react';
import type { MemorySearchResult, MemoryItem } from '../types';

const typeColor: Record<string, string> = {
  FACT: 'bg-[hsl(var(--color-info)/0.1)] text-[hsl(var(--color-info))]',
  PREFERENCE: 'bg-secondary/10 text-secondary',
  CONTACT_NOTE: 'bg-[hsl(var(--color-success)/0.1)] text-[hsl(var(--color-success))]',
  PATTERN: 'bg-[hsl(var(--color-warning)/0.1)] text-[hsl(var(--color-warning))]',
};

function MemoryCard({ memory }: { memory: MemoryItem }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${typeColor[memory.type] ?? 'bg-muted text-muted-foreground'}`}
      >
        {memory.type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground leading-snug">{memory.content}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          {memory.category && (
            <span className="flex items-center gap-0.5">
              <Tag className="h-2.5 w-2.5" />
              {memory.category}
            </span>
          )}
          <span>{(memory.score * 100).toFixed(0)}% match</span>
        </div>
      </div>
    </div>
  );
}

function MemoryRender({
  status,
  result,
}: {
  status: { type: string; reason?: string; error?: unknown };
  result: MemorySearchResult | undefined;
}) {
  if (status.type === 'running') {
    return (
      <div className="chat-tool-running-card">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Brain className="h-4 w-4" />
          <span className="text-sm">Searching memories...</span>
        </div>
      </div>
    );
  }

  if (status.type === 'incomplete' || !result || result.error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">{result?.error ?? 'Memory search failed'}</span>
        </div>
      </div>
    );
  }

  if (result.memories.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-3">
        <p className="text-sm text-muted-foreground">{result.message ?? 'No memories found'}</p>
      </div>
    );
  }

  return (
    <div className="chat-tool-card">
      <div className="flex items-center gap-2 mb-2">
        <Brain className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          {result.memories.length} memor{result.memories.length === 1 ? 'y' : 'ies'} found
        </span>
      </div>
      <div className="divide-y divide-border">
        {result.memories.map((m, i) => (
          <MemoryCard key={`${m.type}-${i}`} memory={m} />
        ))}
      </div>
    </div>
  );
}

export const MemoryToolUI = makeAssistantToolUI<
  { query: string },
  MemorySearchResult
>({
  toolName: 'search_memory',
  render: (props) => <MemoryRender status={props.status} result={props.result} />,
});

export const MemorySearchToolUI = makeAssistantToolUI<
  { query: string },
  MemorySearchResult
>({
  toolName: 'memory_search',
  render: (props) => <MemoryRender status={props.status} result={props.result} />,
});

