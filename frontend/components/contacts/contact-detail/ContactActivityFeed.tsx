import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Avatar,
  alpha,
  useTheme,
  CircularProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
} from '@mui/material';
import {
  Phone,
  Calendar,
  Edit,
  ArrowUpRight,
  ArrowDownLeft,
  MessageSquare,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { ContactInteraction } from '@/lib/api/contacts';
import { useContactHistory } from '@/hooks/queries/use-contacts';
import { formatDateTime } from './contact-detail-utils';

export interface ContactActivityFeedProps {
  contactId: string;
}

export const ContactActivityFeed = ({ contactId }: ContactActivityFeedProps) => {
  const { data: history, isLoading, error } = useContactHistory(contactId);
  const theme = useTheme();
  const t = useTranslations();
  const detailsCopy = t.contacts?.details || {};

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error" variant="body2" align="center">
        {detailsCopy.activity?.loadError || 'Failed to load activity history.'}
      </Typography>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {detailsCopy.activity?.noActivity || 'No recent activity found.'}
        </Typography>
      </Box>
    );
  }

  return (
    <List disablePadding>
      {history.map((interaction: ContactInteraction) => {
        let Icon = MessageSquare;
        let color = theme.palette.text.secondary;
        let label = detailsCopy.interactions?.label || 'Interaction';

        switch (interaction.type) {
          case 'EMAIL_SENT':
            Icon = ArrowUpRight;
            color = theme.palette.success.main;
            label = detailsCopy.interactions?.emailSent || 'Email Sent';
            break;
          case 'EMAIL_RECEIVED':
            Icon = ArrowDownLeft;
            color = theme.palette.info.main;
            label = detailsCopy.interactions?.emailReceived || 'Email Received';
            break;
          case 'MEETING':
            Icon = Calendar;
            color = theme.palette.warning.main;
            label = detailsCopy.interactions?.meeting || 'Meeting';
            break;
          case 'CALL':
            Icon = Phone;
            color = theme.palette.secondary.main;
            label = detailsCopy.interactions?.call || 'Call';
            break;
          case 'NOTE':
            Icon = Edit;
            color = theme.palette.text.secondary;
            label = detailsCopy.interactions?.note || 'Note';
            break;
        }

        return (
          <ListItem
            key={interaction.id}
            alignItems="flex-start"
            sx={{
              mb: 1,
              bgcolor: alpha(theme.palette.background.paper, 0.4),
              backdropFilter: 'blur(10px)',
              borderRadius: 2,
              border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            <ListItemAvatar>
              <Avatar sx={{ bgcolor: alpha(color, 0.1), color: color }}>
                <Icon size={20} />
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    {interaction.summary || label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDateTime(interaction.date)}
                  </Typography>
                </Box>
              }
              secondary={
                <React.Fragment>
                  <Typography
                    variant="body2"
                    color="text.primary"
                    component="span"
                    sx={{ display: 'block', mt: 0.5 }}
                  >
                    {interaction.type === 'EMAIL_SENT' ? `To: ${interaction.contactEmail || 'Contact'}` :
                      interaction.type === 'EMAIL_RECEIVED' ? `From: ${interaction.contactEmail || 'Contact'}` :
                        interaction.sourceType}
                  </Typography>
                  {interaction.sentiment && (
                    <Chip
                      label={interaction.sentiment}
                      size="small"
                      sx={{
                        mt: 0.5,
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: interaction.sentiment === 'POSITIVE' ? alpha(theme.palette.success.main, 0.1) :
                          interaction.sentiment === 'NEGATIVE' ? alpha(theme.palette.error.main, 0.1) :
                            alpha(theme.palette.text.secondary, 0.1),
                        color: interaction.sentiment === 'POSITIVE' ? theme.palette.success.main :
                          interaction.sentiment === 'NEGATIVE' ? theme.palette.error.main :
                            theme.palette.text.secondary
                      }}
                    />
                  )}
                </React.Fragment>
              }
            />
          </ListItem>
        );
      })}
    </List>
  );
};
