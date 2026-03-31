'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Rating,
  TextField,
  Button,
  Alert,
  Skeleton,
  Chip,
} from '@mui/material';
import { Star, CheckCircle, AlertTriangle } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useTranslations } from '@/lib/hooks/use-translations';

interface SurveyData {
  id: string;
  ticketSubject: string;
  alreadyResponded: boolean;
  rating: number | null;
}

interface PortalCsatSurveyProps {
  token: string;
}

export function PortalCsatSurvey({ token }: PortalCsatSurveyProps) {
  const t = useTranslations();
  const tp = t.portal;
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const surveyQuery = useQuery<SurveyData>({
    queryKey: ['portal', 'csat', token],
    queryFn: async () => {
      const { data } = await apiClient.get(`/portal/survey/${token}`);
      return data;
    },
    enabled: !!token,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/portal/survey/${token}`, {
        rating,
        comment: comment.trim() || undefined,
      });
      return data;
    },
    onSuccess: () => setSubmitted(true),
  });

  if (!token) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
        <Skeleton variant="text" width="60%" height={40} />
        <Skeleton variant="rectangular" height={200} sx={{ mt: 2, borderRadius: 1 }} />
      </Box>
    );
  }

  // Loading state
  if (surveyQuery.isLoading) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
        <Skeleton variant="text" width="60%" height={40} />
        <Skeleton variant="rectangular" height={200} sx={{ mt: 2, borderRadius: 1 }} />
      </Box>
    );
  }

  // Error / not found
  if (surveyQuery.isError) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
        <Alert severity="warning" icon={<AlertTriangle size={20} />}>
          {tp?.surveyNotFound ?? 'Survey not found. The link may have expired.'}
        </Alert>
      </Box>
    );
  }

  const survey = surveyQuery.data;

  if (!survey) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
        <Alert severity="warning" icon={<AlertTriangle size={20} />}>
          {tp?.surveyNotFound ?? 'Survey not found. The link may have expired.'}
        </Alert>
      </Box>
    );
  }

  // Already responded (loaded from API)
  if (survey.alreadyResponded && !submitted) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: '#0097a7', marginBottom: 8 }} />
          <Typography variant="h6" gutterBottom>
            {tp?.surveyThankYou ?? 'Thank You!'}
          </Typography>
          <Typography color="text.secondary" gutterBottom>
            {tp?.surveyAlreadySubmitted ?? 'You have already submitted your feedback for this ticket.'}
          </Typography>
          {survey.rating && (
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {tp?.surveyYourRating ?? 'Your rating'}:
              </Typography>
              <Rating value={survey.rating} readOnly size="small" />
            </Box>
          )}
        </Paper>
      </Box>
    );
  }

  // Success state after submit
  if (submitted) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: '#0097a7', marginBottom: 8 }} />
          <Typography variant="h6" gutterBottom>
            {tp?.surveyThankYou ?? 'Thank You!'}
          </Typography>
          <Typography color="text.secondary">
            {tp?.surveyThankYouDesc ?? 'Your feedback helps us improve our support.'}
          </Typography>
        </Paper>
      </Box>
    );
  }

  // Survey form
  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 4 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Star size={32} style={{ color: '#0097a7', marginBottom: 8 }} />
          <Typography variant="h5" fontWeight={600} gutterBottom>
            {tp?.surveyTitle ?? 'How was your support experience?'}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            {tp?.surveyDesc ?? 'Your ticket has been resolved. Please rate your experience.'}
          </Typography>
        </Box>

        {/* Ticket context */}
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {tp?.surveyTicketLabel ?? 'Regarding'}:
          </Typography>
          <Chip label={survey.ticketSubject} size="small" variant="outlined" />
        </Box>

        {/* Star rating */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight={500} gutterBottom>
            {tp?.surveyRatingLabel ?? 'Your rating'}
          </Typography>
          <Rating
            value={rating}
            onChange={(_, newValue) => setRating(newValue)}
            size="large"
            sx={{ fontSize: '2.5rem' }}
          />
        </Box>

        {/* Comment */}
        <TextField
          fullWidth
          multiline
          rows={3}
          size="small"
          label={tp?.surveyCommentLabel ?? 'Additional comments (optional)'}
          placeholder={tp?.surveyCommentPlaceholder ?? 'Tell us more about your experience...'}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          inputProps={{ maxLength: 2000 }}
          sx={{ mb: 3 }}
        />

        {/* Submit */}
        {submitMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(submitMutation.error as Error)?.message ?? 'An error occurred'}
          </Alert>
        )}

        <Button
          variant="contained"
          fullWidth
          disabled={!rating || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
          sx={{ py: 1.2 }}
        >
          {submitMutation.isPending
            ? (tp?.surveySubmitting ?? 'Submitting...')
            : (tp?.surveySubmit ?? 'Submit Feedback')}
        </Button>
      </Paper>
    </Box>
  );
}
