'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  IconButton,
  Collapse,
} from '@mui/material';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { websocketClient } from '@/lib/websocket-client';

interface WebSocketEvent {
  timestamp: string;
  type: string;
  reason?: string;
  emailId?: string;
  hasEmailObject?: boolean;
  emailLabelsCount?: number;
  data: any;
}

/**
 * WebSocketDebugger - Debug component to monitor WebSocket events
 *
 * Shows all incoming WebSocket events in real-time
 */
export const WebSocketDebugger: React.FC = () => {
  const [events, setEvents] = useState<WebSocketEvent[]>([]);
  const [isOpen, setIsOpen] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const addEvent = React.useCallback((event: Omit<WebSocketEvent, 'timestamp'>) => {
    setEvents((prev) => [
      {
        ...event,
        timestamp: new Date().toISOString(),
      },
      ...prev.slice(0, 49), // Keep last 50 events
    ]);
  }, []);

  useEffect(() => {
    // Listen to all WebSocket events
    const unsubEmailNew = websocketClient.onEmailNew((data) => {
      addEvent({
        type: 'email:new',
        reason: data.reason,
        emailId: data.emailId,
        hasEmailObject: !!data.email,
        emailLabelsCount: (data.email as any)?.emailLabels?.length || 0,
        data,
      });
    });

    const unsubEmailUpdate = websocketClient.onEmailUpdate((data) => {
      addEvent({
        type: 'email:update',
        reason: data.reason,
        emailId: data.emailId || (data.email as any)?.id,
        hasEmailObject: !!data.email,
        emailLabelsCount: (data.email as any)?.emailLabels?.length || 0,
        data,
      });
    });

    const unsubEmailDelete = websocketClient.onEmailDelete((data) => {
      addEvent({
        type: 'email:delete',
        reason: data.reason,
        emailId: data.emailId,
        hasEmailObject: !!data.email,
        data,
      });
    });

    const unsubFolderCounts = websocketClient.onFolderCountsUpdate((data) => {
      addEvent({
        type: 'email:folder_counts_update',
        data,
      });
    });

    const unsubSyncStatus = websocketClient.onSyncStatus((data) => {
      addEvent({
        type: 'sync:status',
        data,
      });
    });

    return () => {
      unsubEmailNew();
      unsubEmailUpdate();
      unsubEmailDelete();
      unsubFolderCounts();
      unsubSyncStatus();
    };
  }, [addEvent]);

  const clearEvents = () => {
    setEvents([]);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 400,
        maxHeight: isExpanded ? 600 : 200,
        zIndex: 9999,
        bgcolor: 'background.paper',
        borderRadius: 2,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1.5,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          🔌 WebSocket Events ({events.length})
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => setIsExpanded(!isExpanded)}
            sx={{ color: 'inherit' }}
          >
            {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </IconButton>
          <IconButton
            size="small"
            onClick={() => setIsOpen(false)}
            sx={{ color: 'inherit' }}
          >
            <X size={18} />
          </IconButton>
        </Box>
      </Box>

      {/* Events List */}
      <Collapse in={isExpanded}>
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            maxHeight: 500,
          }}
        >
          {events.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No events yet. Try adding a label to an email.
              </Typography>
            </Box>
          ) : (
            <List dense>
              {events.map((event, index) => (
                <ListItem
                  key={index}
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                  }}
                >
                  <Box sx={{ display: 'flex', gap: 1, mb: 0.5, width: '100%' }}>
                    <Chip
                      label={event.type}
                      size="small"
                      color={
                        event.type.includes('update')
                          ? 'primary'
                          : event.type.includes('delete')
                          ? 'error'
                          : 'success'
                      }
                    />
                    {event.reason && (
                      <Chip label={event.reason} size="small" variant="outlined" />
                    )}
                  </Box>
                  <ListItemText
                    primary={
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </Typography>
                    }
                    secondary={
                      <Box sx={{ fontSize: '0.75rem', mt: 0.5 }}>
                        {event.emailId && (
                          <div>📧 Email: {event.emailId.substring(0, 8)}...</div>
                        )}
                        {event.hasEmailObject !== undefined && (
                          <div>
                            📦 Has email object: {event.hasEmailObject ? '✅' : '❌'}
                          </div>
                        )}
                        {event.emailLabelsCount !== undefined && event.emailLabelsCount > 0 && (
                          <div>🏷️ Labels count: {event.emailLabelsCount}</div>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Collapse>

      {/* Quick Summary */}
      {!isExpanded && events.length > 0 && (
        <Box sx={{ p: 1.5, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary">
            Last event: {events[0].type}
            {events[0].reason && ` (${events[0].reason})`}
          </Typography>
        </Box>
      )}

      {/* Clear Button */}
      {events.length > 0 && (
        <Box sx={{ p: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography
            variant="caption"
            onClick={clearEvents}
            sx={{
              cursor: 'pointer',
              color: 'primary.main',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            Clear all events
          </Typography>
        </Box>
      )}
    </Paper>
  );
};
