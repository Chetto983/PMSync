'use client';

import React from 'react';
import { Copy, Pencil, Check } from 'lucide-react';
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactActions,
  ArtifactAction,
  ArtifactContent,
} from '@/src/components/ai-elements/artifact';

interface ArtifactPanelProps {
  title: string;
  type: 'email-draft' | 'code' | 'document';
  content: React.ReactNode;
  rawContent?: string;  // For copy functionality
  onEdit?: () => void;
  onCopy?: () => void;
}

export function ArtifactPanel({
  title,
  type,
  content,
  rawContent,
  onEdit,
  onCopy,
}: ArtifactPanelProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    if (!rawContent) return;
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopy?.();
    } catch (err) {
      console.error('[ArtifactPanel] Copy failed:', err);
    }
  }, [rawContent, onCopy]);

  const getTypeLabel = () => {
    switch (type) {
      case 'email-draft': return 'Draft Email';
      case 'code': return 'Code';
      case 'document': return 'Document';
      default: return 'Content';
    }
  };

  return (
    <Artifact className="my-3">
      <ArtifactHeader>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            {getTypeLabel()}
          </span>
          <ArtifactTitle>{title}</ArtifactTitle>
        </div>
        <ArtifactActions>
          {rawContent && (
            <ArtifactAction
              tooltip={copied ? 'Copied!' : 'Copy'}
              icon={copied ? Check : Copy}
              onClick={handleCopy}
            />
          )}
          {onEdit && (
            <ArtifactAction
              tooltip="Edit"
              icon={Pencil}
              onClick={onEdit}
            />
          )}
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent>
        {content}
      </ArtifactContent>
    </Artifact>
  );
}

export default ArtifactPanel;
