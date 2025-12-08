import { useEffect, useRef, useState, useCallback } from 'react';
import { emailApi } from '@/lib/api/email';
import { logger } from '@/lib/logger';

export interface DraftData {
  providerId: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}

export interface DraftConflict {
  /**
   * Local draft data that was being saved
   */
  localData: DraftData;
  /**
   * Server draft data that has newer changes
   */
  serverData: DraftData;
  /**
   * Timestamp of server version
   */
  serverUpdatedAt: Date;
  /**
   * Resolve the conflict by keeping local version
   */
  keepLocal: () => Promise<void>;
  /**
   * Resolve the conflict by using server version
   */
  keepServer: () => void;
}

export interface UseDraftAutosaveOptions {
  /**
   * Draft data to autosave
   */
  draftData: DraftData;

  /**
   * Whether autosave is enabled
   */
  enabled: boolean;

  /**
   * Autosave interval in milliseconds (default: 30000 = 30s)
   */
  interval?: number;

  /**
   * Callback when draft is saved successfully
   */
  onSaved?: (draftId: string) => void;

  /**
   * Callback when draft save fails
   */
  onError?: (error: Error) => void;

  /**
   * Callback when a conflict is detected (draft modified elsewhere)
   */
  onConflict?: (conflict: DraftConflict) => void;

  /**
   * Callback to update local draft with server data (for conflict resolution)
   */
  onUpdateFromServer?: (data: DraftData) => void;
}

/**
 * Hook for autosaving email drafts
 *
 * Features:
 * - Automatic periodic saving
 * - Debouncing to avoid too frequent saves
 * - Skip saving if draft is empty
 * - Track saving state and last saved time
 *
 * @example
 * ```tsx
 * const { isSaving, lastSaved, saveDraft } = useDraftAutosave({
 *   draftData: {
 *     providerId,
 *     to: ['user@example.com'],
 *     subject: 'Hello',
 *     bodyText: 'Message',
 *   },
 *   enabled: true,
 *   onSaved: (id) => console.log('Draft saved:', id),
 * });
 * ```
 */
export function useDraftAutosave({
  draftData,
  enabled,
  interval = 30000, // 30 seconds
  onSaved,
  onError,
  onConflict,
  onUpdateFromServer,
}: UseDraftAutosaveOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<string>('');
  const serverVersionRef = useRef<string | null>(null); // Track server version/etag

  // Check if draft is empty
  const isDraftEmpty = useCallback((data: DraftData): boolean => {
    return !data.to?.length && !data.subject && !data.bodyText;
  }, []);

  // Force save (ignoring conflict, overwrites server)
  const forceSave = useCallback(async () => {
    if (!enabled || isDraftEmpty(draftData)) {
      return;
    }

    try {
      setIsSaving(true);
      setHasConflict(false);

      const result = await emailApi.saveDraft({
        id: draftId || undefined,
        ...draftData,
        // Force overwrite by not sending version check
      });

      // Update refs
      lastDataRef.current = JSON.stringify(draftData);
      setDraftId(result.data.id);
      setLastSaved(new Date());
      serverVersionRef.current = result.data.updatedAt || null;

      onSaved?.(result.data.id);
    } catch (error) {
      logger.error('[DraftAutosave] Failed to force save draft', { error });
      onError?.(error as Error);
    } finally {
      setIsSaving(false);
    }
  }, [enabled, draftData, draftId, isDraftEmpty, onSaved, onError]);

  // Save draft function with conflict detection
  const saveDraft = useCallback(async () => {
    if (!enabled || isDraftEmpty(draftData) || hasConflict) {
      return;
    }

    // Check if data changed since last save
    const currentData = JSON.stringify(draftData);
    if (currentData === lastDataRef.current) {
      return; // No changes, skip save
    }

    try {
      setIsSaving(true);

      // If we have an existing draft, check for conflicts first
      if (draftId && serverVersionRef.current) {
        try {
          // Fetch current server state to detect conflicts
          const serverDraft = await emailApi.getDraft(draftId);
          const serverUpdatedAt = serverDraft.data?.updatedAt;

          // Conflict: server version is newer than our last known version
          if (serverUpdatedAt && serverUpdatedAt !== serverVersionRef.current) {
            setHasConflict(true);

            // Build server data for comparison
            const serverData: DraftData = {
              providerId: serverDraft.data?.providerId || draftData.providerId,
              to: serverDraft.data?.to,
              cc: serverDraft.data?.cc,
              bcc: serverDraft.data?.bcc,
              subject: serverDraft.data?.subject,
              bodyHtml: serverDraft.data?.bodyHtml,
              bodyText: serverDraft.data?.bodyText,
            };

            // Notify about conflict
            onConflict?.({
              localData: draftData,
              serverData,
              serverUpdatedAt: new Date(serverUpdatedAt),
              keepLocal: async () => {
                setHasConflict(false);
                await forceSave();
              },
              keepServer: () => {
                setHasConflict(false);
                lastDataRef.current = JSON.stringify(serverData);
                serverVersionRef.current = serverUpdatedAt;
                onUpdateFromServer?.(serverData);
              },
            });

            setIsSaving(false);
            return;
          }
        } catch {
          // If we can't fetch the draft, proceed with save (draft might be deleted)
        }
      }

      const result = await emailApi.saveDraft({
        id: draftId || undefined,
        ...draftData,
      });

      // Update refs
      lastDataRef.current = currentData;
      setDraftId(result.data.id);
      setLastSaved(new Date());
      serverVersionRef.current = result.data.updatedAt || null;

      onSaved?.(result.data.id);
    } catch (error) {
      logger.error('[DraftAutosave] Failed to autosave draft', { error });
      onError?.(error as Error);
    } finally {
      setIsSaving(false);
    }
  }, [enabled, draftData, draftId, isDraftEmpty, onSaved, onError, onConflict, onUpdateFromServer, hasConflict, forceSave]);

  // Setup autosave interval
  useEffect(() => {
    if (!enabled) {
      // Clear timeout if autosave disabled
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      saveDraft();
    }, interval);

    // Cleanup on unmount or when deps change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [draftData, enabled, interval, saveDraft]);

  // Clear conflict state when draft data changes significantly
  const clearConflict = useCallback(() => {
    setHasConflict(false);
  }, []);

  return {
    isSaving,
    lastSaved,
    draftId,
    hasConflict,
    saveDraft,
    forceSave,
    clearConflict,
  };
}
