/**
 * LabelWizardDialog — 4-step MUI Stepper for creating/editing AI-powered labels.
 * Steps: Name & Color > Classification > Behavior > Review
 */
import React, { useState, useCallback, useDeferredValue, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Stepper, Step, StepLabel, MobileStepper,
  TextField, Button, Box, Typography, Chip, Alert,
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  Autocomplete, Collapse, CircularProgress, useMediaQuery, useTheme, ButtonBase,
} from '@mui/material';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useCreateLabelWizard, useUpdateLabelWizard, useLabelWizardOptions, useLabels, useEmails, useWizardLabelPreview } from '@/hooks/queries';
import { useLocale } from '@/lib/hooks/use-locale';
import { ColorPickerPopover } from '@/components/common/ColorPicker';
import { DEFAULT_LABEL_COLOR } from '@/lib/label-colors';
import { labelColorToHex, hexToLabelColor } from '@/lib/api/labels';
import type { Label, LabelColor, CreateLabelWizardDto } from '@/lib/api/labels';

interface LabelWizardDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (label: Label) => void;
  editLabel?: Label | null;
  defaultParentId?: string;
}

const STEPS = ['stepName', 'stepClassify', 'stepBehavior', 'stepReview'] as const;

const CATEGORY_OPTIONS = [
  { value: 'workflow', key: 'categoryWorkflow' },
  { value: 'semantic', key: 'categorySemantic' },
  { value: 'suppression', key: 'categorySuppression' },
  { value: 'custom', key: 'categoryCustom' },
] as const;

const ACTION_OPTIONS = ['none', 'followup', 'urgent', 'decide'] as const;

interface WizardState {
  name: string;
  color: LabelColor;
  parentId: string | null;
  category: string;
  roles: string[];
  contents: string[];
  actionType: string;
  suppressUrgency: boolean;
  mutuallyExclusiveWith: string[];
  aiPrompt: string;
  showAdvanced: boolean;
}

interface SelectionCardProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  description?: string;
}

function SelectionCard({ selected, onClick, label, description }: SelectionCardProps) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        width: '100%',
        display: 'block',
        textAlign: 'left',
        borderRadius: 2,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'primary.50' : 'background.paper',
        px: 1.5,
        py: 1.25,
        transition: 'all 0.15s ease',
        '&:hover': {
          borderColor: selected ? 'primary.main' : 'text.secondary',
          bgcolor: selected ? 'primary.50' : 'action.hover',
        },
      }}
    >
      <Typography variant="body2" fontWeight={selected ? 700 : 500} color={selected ? 'primary.main' : 'text.primary'}>
        {label}
      </Typography>
      {description ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {description}
        </Typography>
      ) : null}
    </ButtonBase>
  );
}

function initState(label?: Label | null, defaultParentId?: string): WizardState {
  return {
    name: label?.name ?? '',
    color: label?.color ?? DEFAULT_LABEL_COLOR,
    parentId: label?.parentId ?? defaultParentId ?? null,
    category: label?.category ?? 'custom',
    roles: label?.roles ?? [],
    contents: label?.contents ?? [],
    actionType: label?.actionType ?? 'none',
    suppressUrgency: label?.suppressUrgency ?? false,
    mutuallyExclusiveWith: label?.mutuallyExclusiveWith ?? [],
    aiPrompt: label?.aiPrompt ?? '',
    showAdvanced: false,
  };
}

export function LabelWizardDialog({ open, onClose, onCreated, editLabel, defaultParentId }: LabelWizardDialogProps) {
  const t = useTranslations();
  const tw = t.email.labels.wizard;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { locale } = useLocale();

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => initState(editLabel, defaultParentId));
  const [error, setError] = useState<string | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [previewEmailId, setPreviewEmailId] = useState('');

  const { data: options } = useLabelWizardOptions();
  const { data: existingLabels } = useLabels();
  const { data: previewEmailList, isPending: isPreviewEmailListPending } = useEmails({ specialUse: 'INBOX', limit: 10 });
  const createMutation = useCreateLabelWizard();
  const updateMutation = useUpdateLabelWizard();

  const isEdit = Boolean(editLabel);
  const isBusy = createMutation.isPending || updateMutation.isPending;

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setStep(0);
      setState(initState(editLabel, defaultParentId));
      setError(null);
      setPreviewEmailId('');
    }
  }, [open, editLabel, defaultParentId]);

  const set = useCallback(<K extends keyof WizardState>(key: K, val: WizardState[K]) => {
    setState((s) => ({ ...s, [key]: val }));
  }, []);

  // Validation per step
  const stepErrors = useMemo(() => {
    const errs: Record<number, string | null> = {};
    if (!state.name.trim()) errs[0] = tw.nameRequired;
    else if (
      existingLabels?.some(
        (l: Label) => l.name.toLowerCase() === state.name.trim().toLowerCase() && l.id !== editLabel?.id,
      )
    ) errs[0] = tw.nameExists;
    if (state.roles.length === 0) errs[1] = tw.rolesRequired;
    else if (state.contents.length === 0) errs[1] = tw.contentsRequired;
    if (!state.actionType) errs[2] = tw.actionRequired;
    return errs;
  }, [state, existingLabels, editLabel, tw]);

  const canNext = !stepErrors[step];

  const handleNext = () => { if (canNext && step < 3) setStep(step + 1); };
  const handleBack = () => { if (step > 0) setStep(step - 1); };

  const handleSubmit = async () => {
    setError(null);
    const dto: CreateLabelWizardDto = {
      name: state.name.trim(),
      color: { backgroundColor: state.color.backgroundColor, textColor: state.color.textColor },
      ...(state.parentId ? { parentId: state.parentId } : {}),
      category: state.category,
      roles: state.roles,
      contents: state.contents,
      actionType: state.actionType,
      suppressUrgency: state.suppressUrgency,
      mutuallyExclusiveWith: state.mutuallyExclusiveWith,
      ...(state.aiPrompt.trim() ? { aiPrompt: state.aiPrompt.trim() } : {}),
    };
    try {
      let result: Label;
      if (isEdit && editLabel) {
        const res = await updateMutation.mutateAsync({ id: editLabel.id, dto });
        result = res.label;
      } else {
        const res = await createMutation.mutateAsync(dto);
        result = res.label;
      }
      onCreated?.(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save label');
    }
  };

  const otherLabels = useMemo(
    () => (existingLabels ?? []).filter((l: Label) => l.id !== editLabel?.id).map((l: Label) => l.name),
    [existingLabels, editLabel],
  );

  const roleOptions = options?.roles ?? [];
  const contentOptions = options?.contents ?? [];
  const previewEmails = useMemo(
    () => (previewEmailList?.emails ?? []).filter((email) => !email.isDraft && !email.isDeleted),
    [previewEmailList],
  );

  React.useEffect(() => {
    if (step !== 3 || previewEmailId || previewEmails.length === 0) {
      return;
    }
    setPreviewEmailId(previewEmails[0].id);
  }, [step, previewEmailId, previewEmails]);

  const previewRequest = useMemo(() => {
    if (step !== 3 || !previewEmailId) {
      return undefined;
    }

    return {
      emailId: previewEmailId,
      labelId: editLabel?.id,
      locale,
      name: state.name.trim(),
      color: { backgroundColor: state.color.backgroundColor, textColor: state.color.textColor },
      category: state.category,
      roles: state.roles,
      contents: state.contents,
      actionType: state.actionType,
      suppressUrgency: state.suppressUrgency,
      mutuallyExclusiveWith: state.mutuallyExclusiveWith,
      ...(state.aiPrompt.trim() ? { aiPrompt: state.aiPrompt.trim() } : {}),
    };
  }, [step, previewEmailId, editLabel?.id, locale, state]);
  const deferredPreviewRequest = useDeferredValue(previewRequest);
  const previewQuery = useWizardLabelPreview(deferredPreviewRequest, step === 3);
  const selectedPreviewEmail = previewEmails.find((email) => email.id === previewEmailId) ?? null;

  // Translate option IDs to display names
  const roleLabel = (id: string) => (tw.roles as Record<string, string>)[id] ?? id;
  const contentLabel = (id: string) => (tw.contents as Record<string, string>)[id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] ?? id;
  const actionLabel = (id: string) => (tw.action as Record<string, string>)[id] ?? id;
  const toggleSelection = useCallback((key: 'roles' | 'contents', value: string) => {
    setState((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));
  }, []);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
      <DialogTitle>{isEdit ? tw.editTitle : tw.title}</DialogTitle>
      <DialogContent dividers>
        {!isMobile ? (
          <Stepper activeStep={step} alternativeLabel sx={{ mb: 3 }}>
            {STEPS.map((s) => (
              <Step key={s}><StepLabel>{tw[s]}</StepLabel></Step>
            ))}
          </Stepper>
        ) : (
          <MobileStepper
            variant="dots" steps={4} position="static" activeStep={step}
            nextButton={<span />} backButton={<span />}
            sx={{ mb: 2, justifyContent: 'center' }}
          />
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Step 0: Name & Color */}
        {step === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label={tw.nameLabel} placeholder={tw.namePlaceholder} fullWidth
              value={state.name} onChange={(e) => set('name', e.target.value)}
              error={Boolean(state.name && stepErrors[0])}
              helperText={state.name ? stepErrors[0] : undefined}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2">{tw.colorLabel}:</Typography>
              <Box
                onClick={(e) => setColorAnchor(e.currentTarget)}
                sx={{
                  width: 32, height: 32, borderRadius: 1, cursor: 'pointer',
                  bgcolor: labelColorToHex(state.color), border: '2px solid', borderColor: 'divider',
                }}
              />
              <ColorPickerPopover
                anchorEl={colorAnchor}
                onClose={() => setColorAnchor(null)}
                selectedColor={labelColorToHex(state.color)}
                onColorSelect={(hex) => { set('color', hexToLabelColor(hex)); setColorAnchor(null); }}
              />
            </Box>
            <FormControl fullWidth>
              <InputLabel>{tw.categoryLabel}</InputLabel>
              <Select
                label={tw.categoryLabel} value={state.category}
                onChange={(e) => set('category', e.target.value)}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{tw[opt.key]}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Step 1: Classification */}
        {step === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{tw.whoSends}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{tw.whoSendsHelp}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                {roleOptions.map((option) => (
                  <SelectionCard
                    key={option}
                    selected={state.roles.includes(option)}
                    onClick={() => toggleSelection('roles', option)}
                    label={roleLabel(option)}
                  />
                ))}
              </Box>
              {state.roles.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.25 }}>
                  {state.roles.map((role) => <Chip key={role} label={roleLabel(role)} size="small" color="primary" variant="outlined" />)}
                </Box>
              ) : null}
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{tw.whatContains}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{tw.whatContainsHelp}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
                {contentOptions.map((option) => (
                  <SelectionCard
                    key={option}
                    selected={state.contents.includes(option)}
                    onClick={() => toggleSelection('contents', option)}
                    label={contentLabel(option)}
                  />
                ))}
              </Box>
              {state.contents.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.25 }}>
                  {state.contents.map((content) => <Chip key={content} label={contentLabel(content)} size="small" color="secondary" variant="outlined" />)}
                </Box>
              ) : null}
            </Box>
          </Box>
        )}

        {/* Step 2: Behavior */}
        {step === 2 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{tw.actionNeeded}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1, mt: 1 }}>
                {ACTION_OPTIONS.map((option) => (
                  <SelectionCard
                    key={option}
                    selected={state.actionType === option}
                    onClick={() => set('actionType', option)}
                    label={actionLabel(option)}
                  />
                ))}
              </Box>
            </Box>
            <FormControlLabel
              control={<Switch checked={state.suppressUrgency} onChange={(_, v) => set('suppressUrgency', v)} />}
              label={<Box><Typography variant="body2">{tw.suppressUrgency}</Typography>
                <Typography variant="caption" color="text.secondary">{tw.suppressUrgencyHelp}</Typography></Box>}
            />
            {otherLabels.length > 0 && (
              <Autocomplete
                multiple value={state.mutuallyExclusiveWith}
                onChange={(_, v) => set('mutuallyExclusiveWith', v)}
                options={otherLabels}
                renderTags={(val, getTagProps) =>
                  val.map((opt, i) => <Chip {...getTagProps({ index: i })} key={opt} label={opt} size="small" />)
                }
                renderInput={(params) => (
                  <TextField {...params} label={tw.conflictsWith} helperText={tw.conflictsWithHelp} />
                )}
              />
            )}
          </Box>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6">{tw.reviewTitle}</Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Box sx={{ width: 16, height: 16, borderRadius: 0.5, bgcolor: labelColorToHex(state.color) }} />
              <Typography variant="subtitle1" fontWeight="bold">{state.name}</Typography>
              <Chip label={state.category} size="small" variant="outlined" />
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {state.roles.map((r) => <Chip key={r} label={roleLabel(r)} size="small" color="primary" variant="outlined" />)}
              {state.contents.map((c) => <Chip key={c} label={contentLabel(c)} size="small" color="secondary" variant="outlined" />)}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {actionLabel(state.actionType)}
              {state.suppressUrgency ? ` | ${tw.urgencySuppressed}` : ''}
            </Typography>
            <Box>
              <Button size="small" onClick={() => set('showAdvanced', !state.showAdvanced)}>
                {tw.editPromptAdvanced}
              </Button>
              <Collapse in={state.showAdvanced}>
                <TextField
                  multiline rows={3} fullWidth value={state.aiPrompt}
                  onChange={(e) => set('aiPrompt', e.target.value)}
                  label={tw.generatedPrompt} sx={{ mt: 1 }}
                />
              </Collapse>
            </Box>

            <Box sx={{ pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {tw.previewTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {tw.previewDescription}
              </Typography>

              {isPreviewEmailListPending ? (
                <Alert severity="info">{tw.previewLoadingEmails}</Alert>
              ) : previewEmails.length === 0 ? (
                <Alert severity="info">
                  <strong>{tw.previewNoEmailsTitle}</strong> {tw.previewNoEmailsDescription}
                </Alert>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{tw.previewEmailLabel}</InputLabel>
                    <Select
                      label={tw.previewEmailLabel}
                      value={previewEmailId}
                      onChange={(e) => setPreviewEmailId(e.target.value)}
                    >
                      {previewEmails.map((email) => (
                        <MenuItem key={email.id} value={email.id}>
                          {email.subject || tw.previewNoSubject} {'·'} {email.from}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedPreviewEmail && (
                    <Typography variant="caption" color="text.secondary">
                      {tw.previewSelectedEmail}: {selectedPreviewEmail.subject || tw.previewNoSubject} {'·'} {selectedPreviewEmail.from}
                    </Typography>
                  )}

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      onClick={() => previewQuery.refetch()}
                      disabled={!previewEmailId || previewQuery.isFetching}
                    >
                      {tw.previewRefresh}
                    </Button>
                  </Box>

                  {previewQuery.isPending || previewQuery.isFetching ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body2" color="text.secondary">
                        {tw.previewLoading}
                      </Typography>
                    </Box>
                  ) : null}

                  {previewQuery.error ? (
                    <Alert severity="error">{tw.previewError}</Alert>
                  ) : null}

                  {previewQuery.data ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Alert severity={previewQuery.data.matched ? 'success' : 'warning'}>
                        {previewQuery.data.matched ? tw.previewMatched : tw.previewNotMatched}
                      </Alert>

                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        <Chip size="small" label={`${tw.previewPriority}: ${previewQuery.data.analysis.priority}`} />
                        <Chip size="small" label={`${tw.previewUrgency}: ${previewQuery.data.analysis.urgency}`} />
                        <Chip size="small" label={`${tw.previewLane}: ${previewQuery.data.analysis.lane || tw.previewNoLane}`} />
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {tw.previewAppliedLabels}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                          {previewQuery.data.analysis.labels.length > 0 ? (
                            previewQuery.data.analysis.labels.map((label) => (
                              <Chip key={label} size="small" label={label} variant="outlined" />
                            ))
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {tw.previewNoLabels}
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {tw.previewSummary}
                        </Typography>
                        <Typography variant="body2">{previewQuery.data.analysis.summary}</Typography>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          {tw.previewReasoning}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {previewQuery.data.analysis.reasoning}
                        </Typography>
                      </Box>
                    </Box>
                  ) : null}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isBusy}>{tw.cancel}</Button>
        <Box sx={{ flex: 1 }} />
        {step > 0 && <Button onClick={handleBack} disabled={isBusy}>{tw.back}</Button>}
        {step < 3 ? (
          <Button variant="contained" onClick={handleNext} disabled={!canNext}>{tw.next}</Button>
        ) : (
          <Button variant="contained" onClick={handleSubmit} disabled={isBusy}
            startIcon={isBusy ? <CircularProgress size={16} /> : undefined}>
            {isEdit ? tw.updateLabel : tw.createLabel}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
