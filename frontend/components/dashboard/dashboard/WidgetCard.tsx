/**
 * WidgetCard - Card wrapper for dashboard widgets (Card variant="outlined" pattern)
 */

import React from 'react';
import { Card } from '@mui/material';

interface WidgetCardProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}

export function WidgetCard({ children, fullWidth = false }: WidgetCardProps) {
  return (
    <Card
      variant="outlined"
      sx={{
        gridColumn: fullWidth ? '1 / -1' : 'auto',
        overflow: 'hidden',
        minHeight: 200,
      }}
    >
      {children}
    </Card>
  );
}
