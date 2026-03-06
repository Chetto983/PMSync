import React from 'react';
import {
  Box,
  Typography,
  Button,
} from '@mui/material';
import { Plus } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export function ContactNotesTab() {
  const t = useTranslations();
  const detailsCopy = t.contacts?.details || {};

  return (
    <>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        {detailsCopy.notes?.title || 'Notes'}
      </Typography>
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {detailsCopy.notes?.noNotes || 'No notes yet'}
        </Typography>
        <Button variant="contained" startIcon={<Plus size={18} />} sx={{ mt: 2 }}>
          {detailsCopy.notes?.addNote || 'Add Note'}
        </Button>
      </Box>
    </>
  );
}
