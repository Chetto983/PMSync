import React, { useState } from 'react';
import {
  Box,
  Typography,
  Alert,
  Skeleton,
  Chip,
  Paper,
  TextField,
  Button,
  IconButton,
  Divider,
  Checkbox,
  FormControlLabel,
  Menu,
  MenuItem,
  ListItemText,
} from '@mui/material';
import { ArrowLeft, Ticket as TicketIcon, Send, FileText } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useTicket,
  useChangeTicketStatus,
  useAddTicketComment,
} from '@/hooks/queries/use-crm-tickets';
import { useTicketTemplates } from '@/hooks/queries/use-crm-ticket-templates';
import { CrmBreadcrumb } from '@/components/common';

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  open: 'primary',
  in_progress: 'warning',
  waiting: 'default',
  resolved: 'success',
  closed: 'error',
};

const BUTTON_COLORS: Record<string, 'inherit' | 'primary' | 'warning' | 'success' | 'error'> = {
  open: 'primary',
  in_progress: 'warning',
  waiting: 'inherit',
  resolved: 'success',
  closed: 'error',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'closed'],
  in_progress: ['waiting', 'resolved', 'closed'],
  waiting: ['in_progress', 'closed'],
  resolved: ['closed'],
  closed: [],
};

export function TicketDetail() {
  const router = useRouter();
  const id = router.query.id as string;
  const t = useTranslations();
  const tt = t.crmTickets;

  const { data: ticket, isLoading, isError, error } = useTicket(id);
  const changeStatus = useChangeTicketStatus();
  const addComment = useAddTicketComment(id);

  const [commentBody, setCommentBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [templateAnchor, setTemplateAnchor] = useState<null | HTMLElement>(null);
  const { data: templates } = useTicketTemplates();

  const statusLabel = (s: string) =>
    (tt?.status as Record<string, string> | undefined)?.[s] ?? s;
  const priorityLabel = (p: string) =>
    (tt?.priority as Record<string, string> | undefined)?.[p] ?? p;

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton width="20%" height={24} animation="wave" sx={{ mb: 1 }} />
        <Skeleton width="50%" height={36} animation="wave" sx={{ mb: 2 }} />
        <Skeleton width="100%" height={200} animation="wave" />
      </Box>
    );
  }

  if (isError || !ticket) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {(error as Error)?.message ?? tt?.loadError ?? 'Error loading ticket'}
        </Alert>
      </Box>
    );
  }

  const allowedTransitions = STATUS_TRANSITIONS[ticket.status] ?? [];

  const handleStatusChange = (newStatus: string) => {
    changeStatus.mutate({ id: ticket.id, status: newStatus });
  };

  const handleAddComment = () => {
    if (!commentBody.trim()) return;
    addComment.mutate(
      { body: commentBody.trim(), isInternal },
      {
        onSuccess: () => {
          setCommentBody('');
          setIsInternal(false);
        },
      },
    );
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200 }}>
      {/* Breadcrumb */}
      <CrmBreadcrumb
        section={tt?.title ?? 'Tickets'}
        sectionHref="/dashboard/crm/tickets"
        entityName={ticket.subject}
      />

      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" aria-label={tt?.title ?? 'Back to tickets'} onClick={() => router.push('/dashboard/crm/tickets')}>
          <ArrowLeft size={20} />
        </IconButton>
        <TicketIcon size={28} />
        <Typography variant="h5" fontWeight={600} sx={{ flex: 1 }}>
          {ticket.subject}
        </Typography>
        <Chip
          label={statusLabel(ticket.status)}
          color={STATUS_COLORS[ticket.status] ?? 'default'}
          variant="outlined"
        />
        <Chip
          label={priorityLabel(ticket.priority)}
          variant="outlined"
          size="small"
        />
      </Box>

      {/* Status transitions */}
      {allowedTransitions.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {tt?.actions?.changeStatus ?? 'Change Status'}:
          </Typography>
          {allowedTransitions.map((s) => (
            <Button
              key={s}
              size="small"
              variant="outlined"
              color={BUTTON_COLORS[s] ?? 'primary'}
              onClick={() => handleStatusChange(s)}
              disabled={changeStatus.isPending}
            >
              {statusLabel(s)}
            </Button>
          ))}
        </Box>
      )}

      {/* Info section */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ minWidth: 150 }}>
            <Typography variant="caption" color="text.secondary">
              {tt?.columns?.assignee ?? 'Assignee'}
            </Typography>
            <Typography variant="body2">{ticket.assignee?.name ?? '—'}</Typography>
          </Box>
          <Box sx={{ minWidth: 150 }}>
            <Typography variant="caption" color="text.secondary">
              {tt?.columns?.contact ?? 'Contact'}
            </Typography>
            <Typography variant="body2">{ticket.contact?.displayName ?? '—'}</Typography>
          </Box>
          <Box sx={{ minWidth: 150 }}>
            <Typography variant="caption" color="text.secondary">
              {tt?.columns?.account ?? 'Account'}
            </Typography>
            <Typography variant="body2">{ticket.account?.name ?? '—'}</Typography>
          </Box>
          <Box sx={{ minWidth: 150 }}>
            <Typography variant="caption" color="text.secondary">
              {tt?.columns?.createdAt ?? 'Created'}
            </Typography>
            <Typography variant="body2">
              {new Date(ticket.createdAt).toLocaleString()}
            </Typography>
          </Box>
          {ticket.slaDeadline && (
            <Box sx={{ minWidth: 150 }}>
              <Typography variant="caption" color="text.secondary">
                {tt?.form?.slaDeadline ?? 'SLA Deadline'}
              </Typography>
              <Typography variant="body2">
                {new Date(ticket.slaDeadline).toLocaleString()}
              </Typography>
            </Box>
          )}
        </Box>
        {ticket.description && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {ticket.description}
            </Typography>
          </>
        )}
      </Paper>

      {/* Comments */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        {tt?.detail?.comments ?? 'Comments'}
      </Typography>

      {(!ticket.comments || ticket.comments.length === 0) && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {tt?.detail?.noComments ?? 'No comments yet'}
        </Typography>
      )}

      {ticket.comments?.map((comment) => (
        <Paper
          key={comment.id}
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 1,
            bgcolor: comment.isInternal ? 'action.hover' : 'transparent',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="subtitle2">
              {comment.author.name}
              {comment.isInternal && (
                <Chip label="Internal" size="small" sx={{ ml: 1 }} />
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(comment.createdAt).toLocaleString()}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {comment.body}
          </Typography>
        </Paper>
      ))}

      {/* Add comment */}
      <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
        {templates && templates.length > 0 && (
          <>
            <Button
              size="small"
              variant="text"
              startIcon={<FileText size={14} />}
              onClick={(e) => setTemplateAnchor(e.currentTarget)}
              sx={{ mb: 1 }}
            >
              {tt?.detail?.insertTemplate ?? 'Insert canned response'}
            </Button>
            <Menu
              anchorEl={templateAnchor}
              open={Boolean(templateAnchor)}
              onClose={() => setTemplateAnchor(null)}
            >
              {templates.map((tpl) => (
                <MenuItem
                  key={tpl.id}
                  onClick={() => {
                    setCommentBody((prev) => (prev ? `${prev}\n${tpl.body}` : tpl.body));
                    setTemplateAnchor(null);
                  }}
                >
                  <ListItemText primary={tpl.name} secondary={tpl.category ?? undefined} />
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
        <TextField
          fullWidth
          multiline
          rows={3}
          size="small"
          placeholder={tt?.detail?.commentPlaceholder ?? 'Write a comment...'}
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          sx={{ mb: 1 }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                {tt?.detail?.internalNote ?? 'Internal note'}
              </Typography>
            }
          />
          <Button
            variant="contained"
            size="small"
            startIcon={<Send size={16} />}
            onClick={handleAddComment}
            disabled={!commentBody.trim() || addComment.isPending}
          >
            {tt?.detail?.addComment ?? 'Add Comment'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
