'use client';

/**
 * CollapsibleWidget - MUI Accordion-based collapsible widget
 * Best practices 2025: Uses unmountOnExit for performance optimization
 * @see https://mui.com/material-ui/react-accordion/
 */

import React, { ReactNode } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { ChevronDown } from 'lucide-react';

interface CollapsibleWidgetProps {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  iconBgColor?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  headerAction?: ReactNode;
  /** Compact summary shown when collapsed */
  collapsedSummary?: ReactNode;
  /** Whether the accordion is controlled externally */
  expanded?: boolean;
  onChange?: (expanded: boolean) => void;
}

export function CollapsibleWidget({
  title,
  subtitle,
  icon,
  iconBgColor,
  children,
  defaultExpanded = false,
  headerAction,
  collapsedSummary,
  expanded: controlledExpanded,
  onChange,
}: CollapsibleWidgetProps) {
  const theme = useTheme();
  const [internalExpanded, setInternalExpanded] = React.useState(defaultExpanded);

  // Support both controlled and uncontrolled modes
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleChange = (_event: React.SyntheticEvent, newExpanded: boolean) => {
    if (onChange) {
      onChange(newExpanded);
    } else {
      setInternalExpanded(newExpanded);
    }
  };

  return (
    <Accordion
      expanded={isExpanded}
      onChange={handleChange}
      elevation={0}
      disableGutters
      // Performance: unmount content when collapsed (best practice 2025)
      TransitionProps={{ unmountOnExit: true }}
      sx={{
        borderRadius: 4,
        border: 1,
        borderColor: alpha(theme.palette.divider, 0.08),
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:before': { display: 'none' },
        '&.Mui-expanded': { margin: 0 },
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: alpha(theme.palette.primary.main, 0.3),
          boxShadow: (theme) => `0 10px 30px ${alpha(theme.palette.common.black, 0.08)}`,
        },
      }}
    >
      <AccordionSummary
        expandIcon={<ChevronDown size={18} />}
        aria-controls={`${title.replace(/\s/g, '-')}-content`}
        id={`${title.replace(/\s/g, '-')}-header`}
        sx={{
          px: 2,
          py: 1,
          minHeight: 56,
          '&.Mui-expanded': { minHeight: 56 },
          '& .MuiAccordionSummary-content': {
            my: 0,
            gap: 1.5,
            alignItems: 'center',
          },
          '& .MuiAccordionSummary-expandIconWrapper': {
            color: 'text.secondary',
          },
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            background: iconBgColor || `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'common.white',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {subtitle}
            </Typography>
          )}
        </Box>

        {/* Collapsed summary - shown only when collapsed */}
        {!isExpanded && collapsedSummary && (
          <Box sx={{ mr: 1 }}>
            {collapsedSummary}
          </Box>
        )}

        {/* Header action - shown only when expanded */}
        {isExpanded && headerAction && (
          <Box onClick={(e) => e.stopPropagation()}>
            {headerAction}
          </Box>
        )}
      </AccordionSummary>

      <AccordionDetails sx={{ p: 0 }}>
        {children}
      </AccordionDetails>
    </Accordion>
  );
}

export default CollapsibleWidget;
