/**
 * WritingStyleSettings - AI Writing Style settings panel.
 * Phase 19-04: Shows style summary, manual samples input, and draft statistics.
 *
 * Sections:
 *   A. Style Summary (read-only) - greeting, tone, sign-off, formality, sentence length
 *   B. Manual Samples (editable) - textarea to paste writing samples that override auto-detected
 *   C. Draft Statistics (read-only) - total drafts, accept/edit/reject rates, avg edit distance
 */
import React, { useState, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Select,
  MenuItem,
  Button,
  Chip,
  Grid,
  Skeleton,
  Alert,
} from '@mui/material';
import { Pen, BarChart3, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useProviders } from '@/hooks/queries';
import {
  useWritingStyle,
  useUpdateManualSamples,
  useDraftStats,
} from '@/hooks/queries/use-writing-style';

// ============ Helper ============

function formalityLabel(
  score: number,
  t: { formalityFormal: string; formalitySemiFormal: string; formalityCasual: string },
): string {
  if (score >= 0.66) return t.formalityFormal;
  if (score >= 0.33) return t.formalitySemiFormal;
  return t.formalityCasual;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ============ Sub-components ============

function StyleSummarySkeleton() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} variant="text" width="60%" height={24} />
      ))}
    </Box>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card variant="outlined" sx={{ textAlign: 'center', py: 1.5, px: 1 }}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Card>
  );
}

// ============ Main Component ============

export function WritingStyleSettings() {
  const t = useTranslations();
  const ws = t.settings?.writingStylePanel;

  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [samples, setSamples] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: providers } = useProviders();
  const providerId = selectedProvider || undefined;
  const { data: style, isLoading: styleLoading } = useWritingStyle(providerId);
  const { data: stats, isLoading: statsLoading } = useDraftStats();
  const updateSamples = useUpdateManualSamples();

  const handleSaveSamples = useCallback(async () => {
    if (!samples.trim()) return;
    await updateSamples.mutateAsync({ samples, providerId });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }, [samples, providerId, updateSamples]);

  if (!ws) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 3 }}>
      {/* ===== Section A: Style Summary ===== */}
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Sparkles size={20} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {ws.title}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {ws.subtitle}
          </Typography>

          {/* Provider selector */}
          {providers && providers.length > 1 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                {ws.selectAccount}
              </Typography>
              <Select
                size="small"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value as string)}
                displayEmpty
                sx={{ minWidth: 240 }}
              >
                <MenuItem value="">{ws.defaultProfile}</MenuItem>
                {providers.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.email} ({p.providerType})
                  </MenuItem>
                ))}
              </Select>
            </Box>
          )}

          {/* Style data */}
          {styleLoading && <StyleSummarySkeleton />}

          {!styleLoading && !style && (
            <Alert severity="info" variant="outlined">
              {ws.noProfile}
            </Alert>
          )}

          {!styleLoading && style && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {style.preferredGreetings?.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                    {ws.greeting}:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {style.preferredGreetings.map((g) => (
                      <Chip key={g} label={g} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                  {ws.formality}:
                </Typography>
                <Chip
                  label={formalityLabel(style.formalityScore, ws)}
                  size="small"
                  color={
                    style.formalityScore >= 0.66
                      ? 'primary'
                      : style.formalityScore >= 0.33
                        ? 'default'
                        : 'secondary'
                  }
                />
              </Box>

              {style.preferredSignOffs?.length > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                    {ws.signOff}:
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {style.preferredSignOffs.map((s) => (
                      <Chip key={s} label={s} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                  {ws.avgSentenceLength}:
                </Typography>
                <Typography variant="body2">
                  {Math.round(style.avgSentenceLength)} {ws.words}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                  {ws.sampleCount}:
                </Typography>
                <Typography variant="body2">{style.sampleCount}</Typography>
              </Box>

              {style.lastAnalyzed && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                    {ws.lastAnalyzed}:
                  </Typography>
                  <Typography variant="body2">
                    {new Date(style.lastAnalyzed).toLocaleDateString()}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* ===== Section B: Manual Samples ===== */}
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Pen size={18} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {ws.manualSamples}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {ws.manualSamplesHelp}
          </Typography>

          <TextField
            multiline
            minRows={4}
            maxRows={10}
            fullWidth
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
            placeholder="Dear John, I hope this email finds you well..."
            sx={{ mb: 2 }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              variant="contained"
              size="small"
              disabled={!samples.trim() || updateSamples.isPending}
              onClick={handleSaveSamples}
            >
              {updateSamples.isPending ? t.common.saving : ws.manualSamplesSave}
            </Button>
            {saveSuccess && (
              <Alert severity="success" variant="outlined" sx={{ py: 0, px: 1 }}>
                {ws.manualSamplesSaved}
              </Alert>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* ===== Section C: Draft Statistics ===== */}
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <BarChart3 size={18} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {ws.draftStats}
            </Typography>
          </Box>

          {statsLoading && (
            <Grid container spacing={2}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={i}>
                  <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 1 }} />
                </Grid>
              ))}
            </Grid>
          )}

          {!statsLoading && (!stats || stats.totalDrafts === 0) && (
            <Alert severity="info" variant="outlined">
              {ws.noDraftStats}
            </Alert>
          )}

          {!statsLoading && stats && stats.totalDrafts > 0 && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
                <StatCard label={ws.totalDrafts} value={stats.totalDrafts} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
                <StatCard label={ws.acceptRate} value={pct(stats.acceptRate)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
                <StatCard label={ws.editRate} value={pct(stats.editRate)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
                <StatCard label={ws.rejectRate} value={pct(stats.rejectRate)} />
              </Grid>
              <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
                <StatCard label={ws.avgEditDistance} value={pct(stats.avgEditDistance)} />
              </Grid>
            </Grid>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
