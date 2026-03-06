/**
 * Settings Sidebar Component
 *
 * Navigation sidebar for settings sections.
 */

import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  alpha,
} from '@mui/material';
import type { SettingsSection } from './useSettingsState';

interface SectionItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SettingsSidebarProps {
  sections: SectionItem[];
  selectedSection: SettingsSection;
  onSelect: (sectionId: SettingsSection) => void;
  accountName: string;
  email: string;
}

export function SettingsSidebar({ sections, selectedSection, onSelect, accountName, email }: SettingsSidebarProps) {
  return (
    <Box sx={{ width: 280, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', borderRight: 1, borderColor: 'divider', bgcolor: 'background.paper', overflow: 'auto' }}>
      <Box sx={{ p: 2 }}>
        <List disablePadding>
          {sections.map((section) => (
            <ListItemButton key={section.id} selected={selectedSection === section.id} onClick={() => onSelect(section.id as SettingsSection)} sx={{ borderRadius: 2, mb: 0.5, py: 1, '&.Mui-selected': { bgcolor: (th) => alpha(th.palette.primary.main, 0.08), '&:hover': { bgcolor: (th) => alpha(th.palette.primary.main, 0.12) } } }}>
              <ListItemIcon sx={{ minWidth: 36, color: selectedSection === section.id ? 'primary.main' : 'text.secondary' }}>{section.icon}</ListItemIcon>
              <ListItemText primary={section.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: selectedSection === section.id ? 600 : 400 }} />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Box sx={{ mt: 'auto', p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.875rem' }}>{accountName.charAt(0).toUpperCase()}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{accountName}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{email}</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
