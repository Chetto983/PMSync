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
export function EditorToolbar({ editor, onAiCompose, aiComposing }: EditorToolbarProps) {
  const t = useTranslations();

  if (!editor) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.5,
        p: 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {/* Undo/Redo */}
      <Tooltip title={t.dashboard.email.composer.undo}>
        <span>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            sx={{
              width: 32,
              height: 32,
              '&.Mui-disabled': { opacity: 0.3 }
            }}
          >
            <Undo2 size={18} />
          </IconButton>
        </span>
      </Tooltip>

      <Tooltip title={t.dashboard.email.composer.redo}>
        <span>
          <IconButton
            size="small"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            sx={{
              width: 32,
              height: 32,
              '&.Mui-disabled': { opacity: 0.3 }
            }}
          >
            <Redo2 size={18} />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* AI Compose */}
      {onAiCompose && (
        <Tooltip title={t.dashboard?.email?.composer?.aiCompose ?? 'AI compose'}>
          <span>
            <IconButton
              size="small"
              onClick={onAiCompose}
              disabled={aiComposing}
              sx={{
                width: 32,
                height: 32,
                bgcolor: aiComposing ? 'action.selected' : 'transparent',
              }}
            >
              {aiComposing ? <Redo2 size={18} /> : <Sparkles size={18} />}
            </IconButton>
          </span>
        </Tooltip>
      )}

      {/* Headings */}
      <Tooltip title={t.dashboard.email.composer.heading1}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('heading', { level: 1 }) ? 'action.selected' : 'transparent',
          }}
        >
          <Heading1 size={18} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t.dashboard.email.composer.heading2}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('heading', { level: 2 }) ? 'action.selected' : 'transparent',
          }}
        >
          <Heading2 size={18} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t.dashboard.email.composer.heading3}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('heading', { level: 3 }) ? 'action.selected' : 'transparent',
          }}
        >
          <Heading3 size={18} />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Text Formatting */}
      <Tooltip title={t.dashboard.email.composer.bold}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBold().run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('bold') ? 'action.selected' : 'transparent',
            fontWeight: editor.isActive('bold') ? 'bold' : 'normal',
          }}
        >
          <Bold size={18} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t.dashboard.email.composer.italic}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('italic') ? 'action.selected' : 'transparent',
          }}
        >
          <Italic size={18} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t.dashboard.email.composer.underline}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('underline') ? 'action.selected' : 'transparent',
          }}
        >
          <UnderlineIcon size={18} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t.dashboard.email.composer.strikethrough}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('strike') ? 'action.selected' : 'transparent',
          }}
        >
          <Strikethrough size={18} />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Lists */}
      <Tooltip title={t.dashboard.email.composer.bulletList}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('bulletList') ? 'action.selected' : 'transparent',
          }}
        >
          <List size={18} />
        </IconButton>
      </Tooltip>

      <Tooltip title={t.dashboard.email.composer.numberedList}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('orderedList') ? 'action.selected' : 'transparent',
          }}
        >
          <ListOrdered size={18} />
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

      {/* Blockquote */}
      <Tooltip title={t.dashboard.email.composer.quote}>
        <IconButton
          size="small"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          sx={{
            width: 32,
            height: 32,
            bgcolor: editor.isActive('blockquote') ? 'action.selected' : 'transparent',
          }}
        >
          <Quote size={18} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
