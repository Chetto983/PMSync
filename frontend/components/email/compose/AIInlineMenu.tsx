import { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';



import { X as CloseIcon, Check as CheckIcon, Send as SendIcon, Sparkles as AutoAwesomeIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from '@/lib/hooks/use-translations';

// Animation variants
const animations = {
  card: {
    initial: { opacity: 0, y: 10, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 10, scale: 0.95 },
  },
};

export type ContentPreviewProps = {
  content: string;
  isLoading?: boolean;
  onAccept?: (value: string) => void | Promise<void>;
  onReject?: () => void | Promise<void>;
  onModify?: (instruction: string) => void | Promise<void>;
};

// ContentPreview component with chat-like input
export function ContentPreview({
  content,
  isLoading,
  onAccept,
  onReject,
  onModify,
}: ContentPreviewProps) {
  const t = useTranslations();
  const composer = t.email.composer;
  const [instruction, setInstruction] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus refinement input when loading finishes (content generated or initial open)
  const prevLoadingRef = useRef(isLoading);
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;
    // Focus when: loading finishes, or component opens with no content
    if ((wasLoading && !isLoading) || (!isLoading && !content)) {
      inputRef.current?.focus();
    }
  }, [isLoading, content]);

  const handleSendInstruction = () => {
    if (instruction.trim() && onModify) {
      onModify(instruction.trim());
      setInstruction('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInstruction();
    }
    if (e.key === 'Escape') {
      onReject?.();
    }
  };

  return (
    <motion.div
      variants={animations.card}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        zIndex: 1500,
        width: 420,
        marginBottom: 8,
      }}
    >
      <Paper
        elevation={8}
        sx={{
          borderRadius: 2,
          overflow: 'hidden',
          border: 1,
          borderColor: 'primary.light',
          bgcolor: 'background.paper',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          }}
        >
          <AutoAwesomeIcon size={18} />
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {composer.aiComposeTitle}
          </Typography>
          <IconButton size="small" onClick={() => onReject?.()} sx={{ color: 'inherit' }}>
            <CloseIcon size={18} />
          </IconButton>
        </Box>

        {/* Instruction Input */}
        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            inputRef={inputRef}
            fullWidth
            size="small"
            placeholder={content ? composer.aiChatPlaceholder : composer.aiComposePlaceholderCompose}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={handleSendInstruction}
                      disabled={isLoading || !instruction.trim()}
                      color="primary"
                    >
                      {isLoading ? <CircularProgress size={18} /> : <SendIcon size={18} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        </Box>

        {/* Content area */}
        {(content || isLoading) && (
          <Box
            sx={{
              maxHeight: 200,
              minHeight: 80,
              overflow: 'auto',
              p: 2,
              bgcolor: 'grey.50',
            }}
          >
            {isLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                  {composer.aiComposeGenerating}
                </Typography>
              </Box>
            ) : (
              content.split('\n').map((line, i) => (
                <Typography
                  key={i}
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    mb: line ? 0.5 : 1,
                    lineHeight: 1.6,
                  }}
                >
                  {line || '\u00A0'}
                </Typography>
              ))
            )}
          </Box>
        )}

        {/* Actions - only show when we have content */}
        {content && !isLoading && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 1,
              p: 1.5,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={() => onReject?.()}
              startIcon={<CloseIcon size={18} />}
            >
              {composer.aiComposeReject}
            </Button>
            <Button
              size="small"
              variant="contained"
              color="primary"
              onClick={() => onAccept?.(content)}
              startIcon={<CheckIcon size={18} />}
            >
              {composer.aiComposeAccept}
            </Button>
          </Box>
        )}
      </Paper>
    </motion.div>
  );
}

export type AIInlineMenuProps = {
  open: boolean;
  content: string | null;
  isLoading: boolean;
  onAccept: (content: string) => void;
  onReject: () => void;
  onModify?: (instruction: string) => void;
};

// Wrapper component for AnimatePresence
export default function AIInlineMenu({
  open,
  content,
  isLoading,
  onAccept,
  onReject,
  onModify,
}: AIInlineMenuProps) {
  return (
    <AnimatePresence>
      {open && (
        <ContentPreview
          content={content || ''}
          isLoading={isLoading}
          onAccept={onAccept}
          onReject={onReject}
          onModify={onModify}
        />
      )}
    </AnimatePresence>
  );
}
