import React from 'react';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  Divider,
} from '@mui/material';
import { CheckCircle } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

export function Tasks() {
  const t = useTranslations();
  const tasksCopy = t.tasks;

  return (
    <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {/* Sidebar */}
      <Paper
        sx={{
          width: 240,
          borderRadius: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: { xs: 'none', md: 'block' },
          p: 2,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
          {tasksCopy.workspace}
        </Typography>
        <List sx={{ p: 0 }}>
          <ListItemButton selected>
            <ListItemText primary={tasksCopy.allTasks} />
          </ListItemButton>
          <ListItemButton>
            <ListItemText primary={tasksCopy.today} />
          </ListItemButton>
          <ListItemButton>
            <ListItemText primary={tasksCopy.upcoming} />
          </ListItemButton>
        </List>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>
          {tasksCopy.myProjects}
        </Typography>
        <List sx={{ p: 0 }}>
          <ListItemButton disabled>
            <ListItemText
              primary={tasksCopy.comingSoon}
              primaryTypographyProps={{ color: 'text.secondary', variant: 'body2' }}
            />
          </ListItemButton>
        </List>
      </Paper>

      {/* Main Content — empty state */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            mb: 2,
          }}
        >
          <CheckCircle size={32} strokeWidth={1.5} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
          {tasksCopy.emptyTitle}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ textAlign: 'center', maxWidth: 360 }}
        >
          {tasksCopy.emptyDescription}
        </Typography>
        <Chip
          label={tasksCopy.comingSoon}
          size="small"
          variant="outlined"
          sx={{ mt: 2 }}
        />
      </Box>
    </Box>
  );
}
