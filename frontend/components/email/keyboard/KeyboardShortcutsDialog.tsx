/**
 * KeyboardShortcutsDialog
 *
 * Help dialog listing all keyboard shortcuts for email navigation.
 * Triggered by pressing ? (Shift+/) in the email list.
 *
 * Phase 05-02: Keyboard Navigation (FE-06)
 */

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Divider,
} from '@mui/material';
import { Keyboard } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Renders a single shortcut row with key chip(s) and label
 */
function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        py: 0.75,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {keys.map((key, i) => (
          <Chip
            key={i}
            label={key}
            size="small"
            sx={{
              fontFamily: 'monospace',
              minWidth: 28,
              height: 24,
              fontSize: '0.75rem',
              fontWeight: 500,
              bgcolor: 'action.selected',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

/**
 * Section header for grouping shortcuts
 */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ mt: 2, mb: 0.5, display: 'block', fontWeight: 600 }}
    >
      {children}
    </Typography>
  );
}

export function KeyboardShortcutsDialog({
  open,
  onClose,
}: KeyboardShortcutsDialogProps) {
  const t = useTranslations();
  const shortcuts = t.email.keyboardShortcuts;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Keyboard size={20} />
        {shortcuts?.title || 'Keyboard Shortcuts'}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {/* Navigation */}
          <SectionHeader>
            {shortcuts?.navigation || 'Navigation'}
          </SectionHeader>
          <ShortcutRow keys={['j']} label={shortcuts?.moveDown || 'Next email'} />
          <ShortcutRow keys={['k']} label={shortcuts?.moveUp || 'Previous email'} />
          <ShortcutRow keys={['Enter']} label={shortcuts?.open || 'Open email'} />
          <ShortcutRow keys={['Esc']} label={shortcuts?.close || 'Close / Deselect'} />

          <Divider sx={{ my: 1.5 }} />

          {/* Actions */}
          <SectionHeader>
            {shortcuts?.actions || 'Actions'}
          </SectionHeader>
          <ShortcutRow keys={['e']} label={shortcuts?.archive || 'Archive'} />
          <ShortcutRow keys={['#']} label={shortcuts?.delete || 'Delete'} />
          <ShortcutRow keys={['r']} label={shortcuts?.reply || 'Reply'} />
          <ShortcutRow keys={['a']} label={shortcuts?.replyAll || 'Reply all'} />
          <ShortcutRow keys={['f']} label={shortcuts?.forward || 'Forward'} />
          <ShortcutRow keys={['x']} label={shortcuts?.toggleSelect || 'Toggle selection'} />

          <Divider sx={{ my: 1.5 }} />

          {/* Other */}
          <SectionHeader>
            {shortcuts?.other || 'Other'}
          </SectionHeader>
          <ShortcutRow keys={['c']} label={shortcuts?.compose || 'Compose new email'} />
          <ShortcutRow keys={['/']} label={shortcuts?.search || 'Focus search'} />
          <ShortcutRow keys={['?']} label={shortcuts?.showHelp || 'Show this help'} />
          <ShortcutRow
            keys={['Cmd', 'K']}
            label={shortcuts?.commandPalette || 'Command palette'}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.common.close || 'Close'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default KeyboardShortcutsDialog;
