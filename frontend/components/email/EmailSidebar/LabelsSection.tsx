import React, { useEffect } from 'react';
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Divider,
  Skeleton,
} from '@mui/material';
import { ChevronDown, Tag, Settings } from 'lucide-react';
import { useLabelStore } from '@/stores/label-store';
import { labelColorToHex } from '@/lib/api/labels';

interface LabelsSectionProps {
  selectedFolderId?: string | null;
  onFolderSelect: (folderId: string) => void;
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  onManageLabels?: () => void;
}

/**
 * Labels section for sidebar navigation
 */
export function LabelsSection({
  selectedFolderId,
  onFolderSelect,
  expanded,
  onExpandChange,
  onManageLabels,
}: LabelsSectionProps) {
  const labels = useLabelStore((state) => state.labels);
  const fetchLabels = useLabelStore((state) => state.fetchLabels);
  const labelsLoading = useLabelStore((state) => state.isLoading);

  // Load labels on mount
  useEffect(() => {
    if (labels.length === 0) {
      fetchLabels();
    }
  }, [labels.length, fetchLabels]);

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
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1 }}>
            <Tag size={14} />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontWeight: 600, textTransform: 'uppercase' }}
            >
              Labels
            </Typography>
            <Box sx={{ flex: 1 }} />
            {onManageLabels && (
              <Box
                component="span"
                role="button"
                tabIndex={0}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onManageLabels();
                }}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    onManageLabels();
                  }
                }}
                sx={{
                  width: 28,
                  height: 28,
                  mr: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <Settings size={14} />
              </Box>
            )}
          </Stack>
        </AccordionSummary>

        <AccordionDetails sx={{ p: 0 }}>
          <List sx={{ px: 1, pb: 1 }}>
            {labelsLoading ? (
              <Box sx={{ px: 2, py: 1 }}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="text" width="50%" />
              </Box>
            ) : labels.length === 0 ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 3, py: 1, display: 'block' }}
              >
                No labels yet
              </Typography>
            ) : (
              labels.slice(0, 10).map((label) => {
                const labelId = `label:${label.id}`;
                const isSelected = selectedFolderId === labelId;
                return (
                  <ListItemButton
                    key={label.id}
                    selected={isSelected}
                    onClick={() => onFolderSelect(labelId)}
                    sx={{
                      borderRadius: 1.5,
                      mb: 0.25,
                      mx: 0.5,
                      py: 0.75,
                      px: 1.5,
                      minHeight: 36,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Tag size={16} color={labelColorToHex(label.color)} />
                    </ListItemIcon>
                    <Chip
                      label={label.name}
                      size="small"
                      sx={{
                        bgcolor: labelColorToHex(label.color),
                        color: '#fff',
                        fontWeight: 500,
                        fontSize: '0.7rem',
                        height: 18,
                      }}
                    />
                    <Box sx={{ flex: 1 }} />
                  </ListItemButton>
                );
              })
            )}
            {labels.length > 10 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 3, py: 0.5, display: 'block' }}
              >
                +{labels.length - 10} more
              </Typography>
            )}
          </List>
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ mx: 2, mb: 1 }} />
    </>
  );
}
