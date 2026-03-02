'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import {
  Brain,
  AlertTriangle,
  Clock,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';
import type { AnalysisResult } from '../types';

const sentimentColor: Record<string, string> = {
  positive: 'bg-green-100 text-green-800',
  negative: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-800',
  mixed: 'bg-amber-100 text-amber-800',
};

const urgencyColor: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-gray-100 text-gray-700',
};

export const AnalysisToolUI = makeAssistantToolUI<
  { emailId: string },
  AnalysisResult
>({
  toolName: 'analyze_email',
  render: ({ status, result }) => {
    if (status.type === 'running') {
      return (
        <div className="rounded-lg border bg-card p-3 animate-pulse">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Brain className="h-4 w-4" />
            <span className="text-sm">Analyzing email...</span>
          </div>
        </div>
      );
    }

    if (status.type === 'incomplete') {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Analysis failed</span>
          </div>
        </div>
      );
    }

    if (!result || result.error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{result?.error ?? 'Unknown error'}</span>
          </div>
        </div>
      );
    }

    const { analysis, subject, from, summary } = result;

    return (
      <div className="rounded-lg border bg-card p-3 shadow-sm space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium truncate max-w-[200px]">
              {subject ?? from}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${sentimentColor[analysis.sentiment] ?? sentimentColor.neutral}`}
            >
              {analysis.sentiment}
            </span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${urgencyColor[analysis.urgency] ?? urgencyColor.low}`}
            >
              {analysis.urgency}
            </span>
          </div>
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground">{summary}</p>

        {/* Key topics */}
        {analysis.keyTopics.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {analysis.keyTopics.map((topic) => (
              <span
                key={topic}
                className="text-xs bg-secondary/10 text-secondary-foreground px-2 py-0.5 rounded-full"
              >
                {topic}
              </span>
            ))}
          </div>
        )}

        {/* Suggested response */}
        {analysis.suggestedResponse && (
          <div className="flex items-start gap-2 text-sm bg-muted/50 rounded-md p-2">
            <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
            <span className="text-muted-foreground">
              {analysis.suggestedResponse}
            </span>
          </div>
        )}

        {/* Footer: deadline + priority */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {analysis.deadline && (
            <span className="flex items-center gap-1 text-amber-600">
              <Clock className="h-3 w-3" />
              Deadline: {analysis.deadline}
            </span>
          )}
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Priority: {analysis.priority}/10
          </span>
        </div>
      </div>
    );
  },
});
