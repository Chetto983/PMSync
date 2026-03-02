/**
 * Tool UI for get_events.
 * Event list with title, time, location, all-day badge.
 */
import { makeAssistantToolUI } from '@assistant-ui/react';
import { Calendar, MapPin, AlertCircle } from 'lucide-react';
import type { EventResult, EventItem } from '../types';

function formatTime(item: EventItem): string {
  if (item.isAllDay) return 'All day';
  if (item.startTimeFormatted) {
    return item.endTimeFormatted
      ? `${item.startTimeFormatted} - ${item.endTimeFormatted}`
      : item.startTimeFormatted;
  }
  if (!item.startTime) return '';
  const start = new Date(item.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!item.endTime) return start;
  const end = new Date(item.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${start} - ${end}`;
}

function EventRow({ event }: { event: EventItem }) {
  return (
    <div className="flex items-start gap-2.5 py-2 px-2 rounded hover:bg-muted/30 transition-colors">
      <Calendar className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{event.title}</p>
          {event.isAllDay && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
              All day
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{formatTime(event)}</p>
        {event.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" />
            {event.location}
          </p>
        )}
      </div>
    </div>
  );
}

export const EventToolUI = makeAssistantToolUI<
  { startDate?: string; endDate?: string },
  EventResult
>({
  toolName: 'get_events',
  render: ({ result, status }) => {
    if (status.type === 'running') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 animate-pulse">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading events...</span>
        </div>
      );
    }
    if (status.type === 'incomplete') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">
            Failed to load events: {'reason' in status ? status.reason : 'unknown'}
          </span>
        </div>
      );
    }
    if (!result) return null;
    if (result.error) {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{result.error}</span>
        </div>
      );
    }
    const events = result.data ?? [];
    return (
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Events
          </span>
          <span className="text-xs text-muted-foreground">{events.length} event{events.length !== 1 ? 's' : ''}</span>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No events found.</p>
        ) : (
          <div className="divide-y divide-border">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
        {result.summary && (
          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{result.summary}</p>
        )}
      </div>
    );
  },
});
