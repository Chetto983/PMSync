import React, { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  Slider,
  Typography,
  Grid,
  Avatar,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import { Upload, ZoomIn, RotateCw, Shuffle, Check } from 'lucide-react';
import AvatarEditor from 'react-avatar-editor';

// DiceBear avatar styles
const DICEBEAR_STYLES = [
  { id: 'avataaars', label: 'Avataaars' },
  { id: 'bottts', label: 'Robots' },
  { id: 'pixel-art', label: 'Pixel Art' },
  { id: 'identicon', label: 'Identicon' },
  { id: 'initials', label: 'Initials' },
  { id: 'lorelei', label: 'Lorelei' },
  { id: 'notionists', label: 'Notionists' },
  { id: 'open-peeps', label: 'Open Peeps' },
  { id: 'thumbs', label: 'Thumbs' },
  { id: 'fun-emoji', label: 'Fun Emoji' },
] as const;

type DiceBearStyle = typeof DICEBEAR_STYLES[number]['id'];

interface AvatarEditorDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (avatarUrl: string) => Promise<void>;
  currentAvatar?: string | null;
  userName?: string;
  userEmail?: string;
  copy: {
    title: string;
    uploadTab: string;
    chooseTab: string;
    zoom: string;
    rotate: string;
    dropHint: string;
    randomize: string;
    cancel: string;
    save: string;
    saving: string;
    styleLabel: string;
  };
}

function generateDiceBearUrl(style: DiceBearStyle, seed: string, size = 256): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=${size}`;
}

function generateRandomSeed(): string {
  return Math.random().toString(36).substring(2, 10);
}

export function AvatarEditorDialog({
  open,
  onClose,
  onSave,
  userName = '',
  userEmail = '',
  copy,
}: AvatarEditorDialogProps) {
  const theme = useTheme();
  const editorRef = useRef<AvatarEditor>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // Upload editor state
  const [image, setImage] = useState<File | string | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [rotation, setRotation] = useState(0);

  // DiceBear state
  const [selectedStyle, setSelectedStyle] = useState<DiceBearStyle>('avataaars');
  const [seed, setSeed] = useState(userEmail || userName || 'user');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Loading state
  const [saving, setSaving] = useState(false);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImage(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImage(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleRandomize = useCallback(() => {
    setSeed(generateRandomSeed());
    setSelectedPreset(null);
  }, []);

  const handlePresetSelect = useCallback((style: DiceBearStyle) => {
    setSelectedStyle(style);
    setSelectedPreset(style);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (activeTab === 0 && image && editorRef.current) {
        // Get cropped image from editor
        const canvas = editorRef.current.getImageScaledToCanvas();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        await onSave(dataUrl);
      } else if (activeTab === 1) {
        // Use DiceBear SVG URL - fetch and convert to base64 (UTF-8 safe)
        const url = generateDiceBearUrl(selectedStyle, seed, 256);
        const response = await fetch(url);
        const svgText = await response.text();
        // btoa() fails with non-ASCII chars, use encodeURIComponent + unescape for UTF-8
        const base64 = btoa(unescape(encodeURIComponent(svgText)));
        const dataUrl = `data:image/svg+xml;base64,${base64}`;
        await onSave(dataUrl);
      }
      onClose();
    } catch {
      // Failed to save avatar - error is handled by onSave callback
    } finally {
      setSaving(false);
    }
  }, [activeTab, image, selectedStyle, seed, onSave, onClose]);

  const handleClose = useCallback(() => {
    // Reset state
    setImage(null);
    setZoom(1.2);
    setRotation(0);
    setActiveTab(0);
    onClose();
  }, [onClose]);

  const canSave = activeTab === 0 ? !!image : true;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 3 },
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>{copy.title}</DialogTitle>

      <Box sx={{ px: 3 }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 500 },
          }}
        >
          <Tab label={copy.uploadTab} />
          <Tab label={copy.chooseTab} />
        </Tabs>
      </Box>

      <DialogContent sx={{ pt: 3, minHeight: 400 }}>
        {/* Upload Tab */}
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            {!image ? (
              // Drop zone
              <Box
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  width: 280,
                  height: 280,
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: (th) => alpha(th.palette.primary.main, 0.04),
                  },
                }}
              >
                <Upload size={48} color={theme.palette.text.secondary} />
                <Typography color="text.secondary" textAlign="center">
                  {copy.dropHint}
                </Typography>
              </Box>
            ) : (
              // Avatar editor
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Box
                  sx={{
                    borderRadius: '50%',
                    overflow: 'hidden',
                    boxShadow: 3,
                  }}
                >
                  <AvatarEditor
                    ref={editorRef}
                    image={image}
                    width={220}
                    height={220}
                    border={30}
                    borderRadius={125}
                    color={[0, 0, 0, 0.6]}
                    scale={zoom}
                    rotate={rotation}
                  />
                </Box>

                {/* Controls */}
                <Box sx={{ width: '100%', maxWidth: 300 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <ZoomIn size={18} color={theme.palette.text.secondary} />
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50 }}>
                      {copy.zoom}
                    </Typography>
                    <Slider
                      value={zoom}
                      onChange={(_, v) => setZoom(v as number)}
                      min={1}
                      max={3}
                      step={0.1}
                      size="small"
                    />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <RotateCw size={18} color={theme.palette.text.secondary} />
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 50 }}>
                      {copy.rotate}
                    </Typography>
                    <Slider
                      value={rotation}
                      onChange={(_, v) => setRotation(v as number)}
                      min={0}
                      max={360}
                      step={1}
                      size="small"
                    />
                  </Box>
                </Box>

                <Button
                  variant="text"
                  size="small"
                  onClick={() => setImage(null)}
                  sx={{ mt: 1 }}
                >
                  Choose different image
                </Button>
              </Box>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              hidden
            />
          </Box>
        )}

        {/* Choose Avatar Tab (DiceBear) */}
        {activeTab === 1 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Preview */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Avatar
                src={generateDiceBearUrl(selectedStyle, seed, 256)}
                sx={{
                  width: 120,
                  height: 120,
                  boxShadow: 3,
                  bgcolor: 'background.paper',
                }}
              />
            </Box>

            {/* Randomize button */}
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<Shuffle size={16} />}
                onClick={handleRandomize}
              >
                {copy.randomize}
              </Button>
            </Box>

            {/* Style picker */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
                {copy.styleLabel}
              </Typography>
              <Grid container spacing={1.5}>
                {DICEBEAR_STYLES.map((style) => (
                  <Grid size={{ xs: 4, sm: 3 }} key={style.id}>
                    <Box
                      onClick={() => handlePresetSelect(style.id)}
                      sx={{
                        position: 'relative',
                        cursor: 'pointer',
                        borderRadius: 2,
                        p: 1,
                        border: 2,
                        borderColor: selectedPreset === style.id ? 'primary.main' : 'transparent',
                        bgcolor: selectedPreset === style.id
                          ? (th) => alpha(th.palette.primary.main, 0.08)
                          : 'transparent',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          bgcolor: (th) => alpha(th.palette.primary.main, 0.04),
                        },
                      }}
                    >
                      <Avatar
                        src={generateDiceBearUrl(style.id, seed, 64)}
                        sx={{
                          width: 48,
                          height: 48,
                          mx: 'auto',
                          mb: 0.5,
                          bgcolor: 'background.paper',
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          textAlign: 'center',
                          fontWeight: selectedPreset === style.id ? 600 : 400,
                          color: selectedPreset === style.id ? 'primary.main' : 'text.secondary',
                        }}
                      >
                        {style.label}
                      </Typography>
                      {selectedPreset === style.id && (
                        <Box
                          sx={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Check size={12} color="white" />
                        </Box>
                      )}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={handleClose} disabled={saving}>
          {copy.cancel}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!canSave || saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {saving ? copy.saving : copy.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
