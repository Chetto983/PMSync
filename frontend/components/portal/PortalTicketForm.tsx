'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Paper,
  Alert,
} from '@mui/material';
import { Send, CheckCircle } from 'lucide-react';
import NextLink from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

interface PortalTicketFormProps {
  tenantSlug: string;
}

interface SubmitResult {
  portalToken: string;
  message: string;
}

export function PortalTicketForm({ tenantSlug }: PortalTicketFormProps) {
  const loadTimestamp = useRef(Date.now().toString());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  // Honeypot field — hidden from real users, bots will fill it
  const [website, setWebsite] = useState('');

  const submitMutation = useMutation({
    mutationFn: (data: Record<string, string | undefined>) =>
      apiClient
        .post<SubmitResult>(`/portal/${tenantSlug}/tickets`, data)
        .then((r) => r.data),
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submitMutation.mutate({
        name,
        email,
        subject,
        description: description || undefined,
        priority,
        website, // honeypot
        _ts: loadTimestamp.current, // timestamp anti-spam
      });
    },
    [name, email, subject, description, priority, website, submitMutation],
  );

  if (!tenantSlug) return null;

  // Success state — show tracking token
  if (submitMutation.isSuccess && submitMutation.data?.portalToken) {
    const token = submitMutation.data.portalToken;
    const trackUrl = `/portal/${tenantSlug}/tickets/${token}`;

    return (
      <Box sx={{ maxWidth: 600, mx: 'auto', textAlign: 'center', py: 6 }}>
        <CheckCircle size={48} color="green" />
        <Typography variant="h5" fontWeight={600} sx={{ mt: 2 }}>
          Ticket Submitted
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Your request has been received. Use the link below to track its status.
        </Typography>
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Tracking Token
          </Typography>
          <Typography variant="h6" fontFamily="monospace" sx={{ mt: 0.5 }}>
            {token}
          </Typography>
        </Paper>
        <Button
          variant="contained"
          component={NextLink}
          href={trackUrl}
        >
          Track My Ticket
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Submit a Ticket
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Describe your issue and we&apos;ll get back to you as soon as possible.
      </Typography>

      {submitMutation.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(submitMutation.error as Error).message || 'Failed to submit ticket'}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            size="small"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            size="small"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            size="small"
            label="Subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            sx={{ mb: 2 }}
          />

          <TextField
            fullWidth
            size="small"
            label="Description"
            multiline
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ mb: 2 }}
          />

          <TextField
            select
            fullWidth
            size="small"
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            sx={{ mb: 3 }}
          >
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="high">High</MenuItem>
          </TextField>

          {/* Honeypot — invisible to real users */}
          <TextField
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            sx={{ position: 'absolute', left: -9999, opacity: 0 }}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            startIcon={<Send size={16} />}
            disabled={submitMutation.isPending || !name || !email || !subject}
          >
            {submitMutation.isPending ? 'Submitting...' : 'Submit Ticket'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
