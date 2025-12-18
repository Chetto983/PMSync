import React from 'react';
import {
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Divider,
} from '@mui/material';
import { ChevronDown, Filter } from 'lucide-react';
import type { SmartFilter } from './types';

interface SmartFiltersSectionProps {
  filters: SmartFilter[];
  selectedFolderId?: string | null;
  onFolderSelect: (folderId: string) => void;
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  t: {
    email: {
      quickFilters: {
        title: string;
      };
    };
  };
}

/**
 * Smart filters section for quick email filtering
 */
export function SmartFiltersSection({
  filters,
  selectedFolderId,
  onFolderSelect,
  expanded,
  onExpandChange,
  t,
}: SmartFiltersSectionProps) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <>
      <Accordion
        expanded={expanded}
        onChange={() => onExpandChange(!expanded)}
        disableGutters
        elevation={0}
        sx={{
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0 },
        }}
      >
        <AccordionSummary
          expandIcon={<ChevronDown size={16} />}
          sx={{
            minHeight: 40,
            px: 2,
            '&.Mui-expanded': { minHeight: 40 },
            '& .MuiAccordionSummary-content': { my: 0.5 },
          }}
        >
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Filter size={14} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, textTransform: 'uppercase' }}
            >
              {t.email.quickFilters.title}
            </Typography>
          </Stack>
        </AccordionSummary>

        <AccordionDetails sx={{ p: 0 }}>
          <List sx={{ px: 1, pb: 1 }}>
            {filters.map((filter) => {
              const isSelected = selectedFolderId === filter.id;
              return (
                <ListItemButton
                  key={filter.id}
                  selected={isSelected}
                  onClick={() => onFolderSelect(filter.id)}
                  sx={{
                    borderRadius: 1.5,
                    mb: 0.25,
                    mx: 0.5,
                    py: { xs: 1, sm: 0.75 },
                    px: 1.5,
                    minHeight: { xs: 44, sm: 36 },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 32,
                      color: filter.color || 'inherit',
                    }}
                  >
                    {filter.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={filter.label}
                    primaryTypographyProps={{
                      fontSize: '0.8125rem',
                      fontWeight: isSelected ? 600 : 500,
                    }}
                  />
                  {filter.count != null && filter.count > 0 && (
                    <Chip
                      label={filter.count}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    />
                  )}
                </ListItemButton>
              );
            })}
          </List>
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ mx: 2, mb: 1 }} />
    </>
  );
}
