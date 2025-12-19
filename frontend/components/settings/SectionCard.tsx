import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';

export interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function SectionCard({ title, description, children, action }: SectionCardProps) {
  return (
    <Card variant="outlined" sx={{ mb: 3 }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: description ? 1 : 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {action}
        </Box>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {description}
          </Typography>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
