import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Switch,
  FormControlLabel,
  TextField,
  Divider,
} from '@mui/material';
import { Bell, ListTodo } from 'lucide-react';
import type { StageAutomationRule, CrmStage } from '@/lib/api/crm-pipelines';
import type { AppTranslations } from '@/locales';

type AutomationTranslations = NonNullable<
  NonNullable<AppTranslations['crmPipelines']>['settings']
>['automations'];

interface StageAutomationsDialogProps {
  open: boolean;
  onClose: () => void;
  stage: CrmStage;
  ta: AutomationTranslations;
  tc: AppTranslations['common'];
  onSave: (automations: StageAutomationRule[]) => void;
  isSaving?: boolean;
}

const DEFAULT_RULES: StageAutomationRule[] = [
  { type: 'NOTIFY', enabled: false, params: {} },
  { type: 'CREATE_TASK', enabled: false, params: {} },
];

function parseRules(raw: StageAutomationRule[] | null): StageAutomationRule[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_RULES.map((r) => ({ ...r, params: { ...r.params } }));
  // Merge with defaults to ensure both types exist
  const map = new Map(raw.map((r) => [r.type, r]));
  return DEFAULT_RULES.map((def) => {
    const existing = map.get(def.type);
    return existing ? { ...existing, params: { ...existing.params } } : { ...def, params: { ...def.params } };
  });
}

export function StageAutomationsDialog({
  open,
  onClose,
  stage,
  ta,
  tc,
  onSave,
  isSaving,
}: StageAutomationsDialogProps) {
  const [rules, setRules] = useState<StageAutomationRule[]>(() => parseRules(stage.automations));

  useEffect(() => {
    if (open) setRules(parseRules(stage.automations));
  }, [open, stage.automations]);

  const updateRule = (type: string, patch: Partial<StageAutomationRule>) => {
    setRules((prev) =>
      prev.map((r) => (r.type === type ? { ...r, ...patch } : r)),
    );
  };

  const updateParams = (type: string, paramPatch: Record<string, string | undefined>) => {
    setRules((prev) =>
      prev.map((r) =>
        r.type === type ? { ...r, params: { ...r.params, ...paramPatch } } : r,
      ),
    );
  };

  const notifyRule = rules.find((r) => r.type === 'NOTIFY')!;
  const taskRule = rules.find((r) => r.type === 'CREATE_TASK')!;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {ta?.title ?? 'Automations'} — {stage.name}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {ta?.description ?? 'Actions that run automatically when a deal enters this stage.'}
        </Typography>

        {/* NOTIFY rule */}
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={notifyRule.enabled}
                onChange={(e) => updateRule('NOTIFY', { enabled: e.target.checked })}
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Bell size={16} />
                <Typography variant="body2" fontWeight={500}>
                  {ta?.notify ?? 'Send notification'}
                </Typography>
              </Box>
            }
          />
          <Typography variant="caption" color="text.secondary" sx={{ pl: 6.5, display: 'block' }}>
            {ta?.notifyDescription ?? 'Notify team members when a deal enters this stage.'}
          </Typography>
          {notifyRule.enabled && (
            <TextField
              size="small"
              fullWidth
              label={ta?.notifyMessage ?? 'Custom message'}
              placeholder={ta?.notifyMessagePlaceholder ?? 'Deal "{dealName}" entered stage "{stageName}"'}
              value={notifyRule.params.message ?? ''}
              onChange={(e) => updateParams('NOTIFY', { message: e.target.value || undefined })}
              sx={{ mt: 1, ml: 6.5, width: 'calc(100% - 52px)' }}
              helperText="{dealName}, {stageName}"
            />
          )}
        </Box>

        <Divider sx={{ my: 1 }} />

        {/* CREATE_TASK rule */}
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={taskRule.enabled}
                onChange={(e) => updateRule('CREATE_TASK', { enabled: e.target.checked })}
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ListTodo size={16} />
                <Typography variant="body2" fontWeight={500}>
                  {ta?.createTask ?? 'Create task'}
                </Typography>
              </Box>
            }
          />
          <Typography variant="caption" color="text.secondary" sx={{ pl: 6.5, display: 'block' }}>
            {ta?.createTaskDescription ?? 'Automatically create a follow-up task.'}
          </Typography>
          {taskRule.enabled && (
            <Box sx={{ mt: 1, ml: 6.5, width: 'calc(100% - 52px)', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                label={ta?.taskTitle ?? 'Task title'}
                placeholder={ta?.taskTitlePlaceholder ?? 'Follow up: {dealName}'}
                value={taskRule.params.taskTitle ?? ''}
                onChange={(e) => updateParams('CREATE_TASK', { taskTitle: e.target.value || undefined })}
                helperText="{dealName}, {stageName}"
              />
              <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                label={ta?.taskDescription ?? 'Task description'}
                placeholder={ta?.taskDescriptionPlaceholder ?? 'Auto-created when deal entered stage "{stageName}"'}
                value={taskRule.params.taskDescription ?? ''}
                onChange={(e) => updateParams('CREATE_TASK', { taskDescription: e.target.value || undefined })}
              />
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{tc?.cancel ?? 'Cancel'}</Button>
        <Button
          variant="contained"
          onClick={() => onSave(rules)}
          disabled={isSaving}
        >
          {tc?.save ?? 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
