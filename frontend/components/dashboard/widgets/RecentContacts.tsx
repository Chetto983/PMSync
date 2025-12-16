'use client';

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Divider,
  Button,
  Skeleton,
} from '@mui/material';
import { Users, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/router';
import { DashboardCard } from '../DashboardCard';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useRecentContacts, type RecentContact } from '@/hooks/queries';

interface RecentContactsWidgetProps {
  limit?: number;
}

export function RecentContactsWidget({ limit = 5 }: RecentContactsWidgetProps) {
  const router = useRouter();
  const t = useTranslations();
  const { data, isLoading } = useRecentContacts({ limit });

  const contacts = data?.contacts || [];

  const handleContactClick = (contact: RecentContact) => {
    router.push(`/dashboard/contacts?id=${contact.id}`);
  };

  return (
    <DashboardCard
      title={t.dashboard.home.sections.recentConnections}
      subtitle={t.dashboard.home.sections.recentConnectionsSubtitle}
    >
      {isLoading ? (
        <Box sx={{ py: 2 }}>
          {[1, 2, 3].map((i) => (
            <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="60%" height={20} />
                <Skeleton width="80%" height={16} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : contacts.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Users size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <Typography variant="body2" color="text.secondary">
            {t.dashboard.home.sections.noRecentContacts}
          </Typography>
        </Box>
      ) : (
        <>
          <List sx={{ p: 0 }}>
            {contacts.map((contact, index) => (
              <React.Fragment key={contact.id}>
                {index > 0 && <Divider />}
                <ListItemButton onClick={() => handleContactClick(contact)}>
                  <ListItemAvatar>
                    <Avatar>{contact.name?.[0]?.toUpperCase() || 'U'}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={contact.name}
                    secondary={contact.company || contact.email}
                    primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 600 }}
                    secondaryTypographyProps={{ fontSize: '0.75rem' }}
                  />
                </ListItemButton>
              </React.Fragment>
            ))}
          </List>
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Button
              endIcon={<ArrowRight size={18} />}
              onClick={() => router.push('/dashboard/contacts')}
            >
              {t.common.viewAll}
            </Button>
          </Box>
        </>
      )}
    </DashboardCard>
  );
}

export default RecentContactsWidget;
