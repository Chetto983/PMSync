"use client";

import { Badge } from "@/components/ui/badge";
import {
  AlertTriangleIcon,
  BrainIcon,
  CalendarIcon,
  ClockIcon,
  TagIcon,
} from "lucide-react";
import type { ToolRendererProps, AnalysisResult } from "../types";
import { RawJsonToggle } from "../shared/RawJsonToggle";

const SENTIMENT_EMOJI: Record<string, string> = {
  positive: "😊",
  negative: "😟",
  neutral: "😐",
  mixed: "😕",
};

const URGENCY_CONFIG: Record<string, { color: string; label: string }> = {
  critical: { color: "bg-red-100 text-red-700 border-red-200", label: "Critical" },
  high: { color: "bg-orange-100 text-orange-700 border-orange-200", label: "High" },
  medium: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Medium" },
  low: { color: "bg-green-100 text-green-700 border-green-200", label: "Low" },
};

/**
 * Smart renderer for analyze_email tool.
 * Shows analysis summary, sentiment, urgency, priority, topics, and smart replies.
 */
export function AnalysisRenderer({ output, errorText }: ToolRendererProps) {
  if (errorText) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{errorText}</p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  const result = output as AnalysisResult;

  if (result.error) {
    return (
      <div className="p-3">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-sm">{result.error}</p>
        </div>
      </div>
    );
  }

  const { analysis } = result;
  if (!analysis) return null;

  const urgencyCfg = URGENCY_CONFIG[analysis.urgency] || URGENCY_CONFIG.medium;

  return (
    <div className="p-3 space-y-3">
      {/* Header: email context */}
      <div className="text-xs text-muted-foreground">
        <span className="font-medium">{result.from}</span>
        {result.subject && (
          <span className="ml-1">— {result.subject}</span>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground leading-relaxed">{result.summary}</p>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Sentiment */}
        <Badge variant="outline" className="text-[11px] px-1.5 py-0 gap-1">
          {SENTIMENT_EMOJI[analysis.sentiment] || "😐"}{" "}
          {analysis.sentiment}
        </Badge>

        {/* Urgency */}
        <Badge variant="outline" className={`text-[11px] px-1.5 py-0 ${urgencyCfg.color}`}>
          {urgencyCfg.label}
        </Badge>

        {/* Priority */}
        <Badge variant="outline" className="text-[11px] px-1.5 py-0 gap-1">
          {"★".repeat(Math.min(analysis.priority, 5))}
          {"☆".repeat(Math.max(0, 5 - analysis.priority))}
        </Badge>

        {/* Intent */}
        <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
          {analysis.intent.replace(/_/g, " ")}
        </Badge>
      </div>

      {/* Key topics */}
      {analysis.keyTopics?.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <TagIcon className="h-3 w-3 text-muted-foreground" />
          {analysis.keyTopics.map((topic) => (
            <Badge key={topic} variant="secondary" className="text-[10px] px-1.5 py-0">
              {topic}
            </Badge>
          ))}
        </div>
      )}

      {/* Suggested response timing */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ClockIcon className="h-3 w-3" />
        <span>
          Respond:{" "}
          <span className="font-medium">
            {analysis.suggestedResponse.replace(/_/g, " ")}
          </span>
        </span>
        {analysis.deadline && (
          <>
            <CalendarIcon className="h-3 w-3 ml-2" />
            <span>Deadline: {new Date(analysis.deadline).toLocaleDateString()}</span>
          </>
        )}
      </div>

      {/* Suggested labels */}
      {result.suggestedLabels?.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          <span className="text-muted-foreground">Suggested labels:</span>
          {result.suggestedLabels.map((label) => (
            <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0">
              {label}
            </Badge>
          ))}
        </div>
      )}

      {/* Smart replies */}
      {result.smartReplies && result.smartReplies.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BrainIcon className="h-3 w-3" />
            <span>Quick replies</span>
          </div>
          <div className="space-y-1">
            {result.smartReplies.map((reply, i) => (
              <div
                key={i}
                className="text-xs bg-muted/40 rounded-md px-2.5 py-1.5 text-foreground"
              >
                {reply}
              </div>
            ))}
          </div>
        </div>
      )}

      <RawJsonToggle data={output} />
    </div>
  );
}
