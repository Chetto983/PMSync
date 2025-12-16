import React from 'react';
import { Box, IconButton, Divider, Tooltip } from '@mui/material';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Undo2,
  Redo2,
  Sparkles,
} from 'lucide-react';
import type { Editor } from '@tiptap/core';
import { useTranslations } from '@/lib/hooks/use-translations';

interface EditorToolbarProps {
  /**
   * TipTap editor instance
   */
  editor: Editor | null;
  /**
   * Optional AI compose trigger
   */
  onAiCompose?: () => void;
  /**
   * Loading state for AI compose
   */
  aiComposing?: boolean;
  /**
   * Compact mode for mobile - shows fewer buttons
   * @default false
   */
  compact?: boolean;
}

/**
 * Toolbar for TipTap editor with rich text formatting buttons
 *
 * Features:
 * - Text formatting: Bold, Italic, Underline, Strikethrough
 * - Headings: H1, H2, H3
 * - Lists: Bullet, Numbered
 * - Blockquote
 * - Undo/Redo
 */
export function EditorToolbar({ editor, onAiCompose, aiComposing, compact = false }: EditorToolbarProps) {
  const t = useTranslations();

  if (!editor) {
    return null;
  }

  // Button size for touch targets
  const buttonSize = compact ? 40 : 32;
  const iconSize = compact ? 20 : 18;

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: compact ? 0.25 : 0.5,
        p: compact ? 0.5 : 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        overflowX: compact ? 'auto' : 'visible',
        // Hide scrollbar on mobile
        '&::-webkit-scrollbar': compact ? { display: 'none' } : {},
        scrollbarWidth: compact ? 'none' : 'auto',
      }}
    >
      {/* AI Compose - Always show, important for mobile */}
      {onAiCompose && (
        <Tooltip title={t.email.composer.aiCompose}>
          <span>
            <IconButton
              size="small"
              onClick={onAiCompose}
              disabled={aiComposing}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: aiComposing ? 'action.selected' : 'transparent',
              }}
            >
              {aiComposing ? <Redo2 size={iconSize} /> : <Sparkles size={iconSize} />}
            </IconButton>
          </span>
        </Tooltip>
      )}

      {/* Undo/Redo - Show on both */}
      <Tooltip title={t.email.composer.undo}>
        <span>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            sx={{
              width: buttonSize,
              height: buttonSize,
              '&.Mui-disabled': { opacity: 0.3 }
            }}
          >
            <Undo2 size={iconSize} />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={t.email.composer.redo}>
        <span>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            sx={{
              width: buttonSize,
              height: buttonSize,
              '&.Mui-disabled': { opacity: 0.3 }
            }}
          >
            <Redo2 size={iconSize} />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Text Formatting - Essential buttons first */}
      <Tooltip title={t.email.composer.bold}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBold().run()}
          sx={{
            width: buttonSize,
            height: buttonSize,
            bgcolor: editor.isActive('bold') ? 'action.selected' : 'transparent',
            fontWeight: editor.isActive('bold') ? 'bold' : 'normal',
          }}
        >
          <Bold size={iconSize} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t.email.composer.italic}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          sx={{
            width: buttonSize,
            height: buttonSize,
            bgcolor: editor.isActive('italic') ? 'action.selected' : 'transparent',
          }}
        >
          <Italic size={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Lists - Essential for mobile */}
      <Tooltip title={t.email.composer.bulletList}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          sx={{
            width: buttonSize,
            height: buttonSize,
            bgcolor: editor.isActive('bulletList') ? 'action.selected' : 'transparent',
          }}
        >
          <List size={iconSize} />
        </IconButton>
      </Tooltip>

      {/* Desktop-only buttons */}
      {!compact && (
        <>
          <Tooltip title={t.email.composer.underline}>
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: editor.isActive('underline') ? 'action.selected' : 'transparent',
              }}
            >
              <UnderlineIcon size={iconSize} />
            </IconButton>
          </Tooltip>

          <Tooltip title={t.email.composer.strikethrough}>
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: editor.isActive('strike') ? 'action.selected' : 'transparent',
              }}
            >
              <Strikethrough size={iconSize} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Headings - Desktop only */}
          <Tooltip title={t.email.composer.heading1}>
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: editor.isActive('heading', { level: 1 }) ? 'action.selected' : 'transparent',
              }}
            >
              <Heading1 size={iconSize} />
            </IconButton>
          </Tooltip>

          <Tooltip title={t.email.composer.heading2}>
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: editor.isActive('heading', { level: 2 }) ? 'action.selected' : 'transparent',
              }}
            >
              <Heading2 size={iconSize} />
            </IconButton>
          </Tooltip>

          <Tooltip title={t.email.composer.heading3}>
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: editor.isActive('heading', { level: 3 }) ? 'action.selected' : 'transparent',
              }}
            >
              <Heading3 size={iconSize} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          <Tooltip title={t.email.composer.numberedList}>
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: editor.isActive('orderedList') ? 'action.selected' : 'transparent',
              }}
            >
              <ListOrdered size={iconSize} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Blockquote - Desktop only */}
          <Tooltip title={t.email.composer.quote}>
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              sx={{
                width: buttonSize,
                height: buttonSize,
                bgcolor: editor.isActive('blockquote') ? 'action.selected' : 'transparent',
              }}
            >
              <Quote size={iconSize} />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Box>
  );
}
