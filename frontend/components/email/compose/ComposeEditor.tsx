/**
 * Compose Editor Component
 *
 * Tiptap-based rich text editor for email composition.
 * Supports formatting, lists, links, and image handling.
 *
 * @see https://tiptap.dev/docs/editor/getting-started
 */

import { useEffect, useRef } from 'react';
import { Box, IconButton, Divider, Tooltip } from '@mui/material';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Heading1,
  Heading2,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// Toolbar button component - defined outside to avoid recreation on each render
interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  tooltip: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, tooltip, children }: ToolbarButtonProps) {
  return (
    <Tooltip title={tooltip}>
      <IconButton
        size="small"
        onClick={onClick}
        sx={{
          p: 0.5,
          borderRadius: 1,
          color: isActive ? 'primary.main' : 'text.secondary',
          bgcolor: isActive ? 'action.selected' : 'transparent',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

interface ComposeEditorProps {
  /** Initial HTML content */
  initialContent?: string;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Called when content changes */
  onChange?: (html: string) => void;
  /** Minimum editor height */
  minHeight?: number;
  /** Whether editor is read-only */
  readOnly?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

export function ComposeEditor({
  initialContent = '',
  placeholder,
  onChange,
  minHeight = 200,
  readOnly = false,
  autoFocus = false,
}: ComposeEditorProps) {
  const t = useTranslations();
  // Track last set content to prevent infinite loops
  const lastSetContentRef = useRef<string>(initialContent);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder: placeholder || t.email?.composer?.bodyPlaceholder || 'Compose your message...',
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
    ],
    content: initialContent,
    editable: !readOnly,
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: false, // Fix SSR hydration mismatch
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'compose-editor-content',
      },
    },
  });

  // Update content when initialContent prop changes from external source (e.g., loading draft)
  // Use ref to track what we've set to prevent infinite loops from Tiptap's HTML normalization
  useEffect(() => {
    if (editor && initialContent !== lastSetContentRef.current) {
      lastSetContentRef.current = initialContent;
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  if (!editor) {
    return null;
  }

  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        '&:focus-within': {
          borderColor: 'primary.main',
        },
      }}
    >
      {/* Toolbar */}
      {!readOnly && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            px: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
            flexWrap: 'wrap',
          }}
        >
          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            tooltip={t.email?.composer?.undo || 'Undo'}
          >
            <Undo size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            tooltip={t.email?.composer?.redo || 'Redo'}
          >
            <Redo size={16} />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            tooltip={t.email?.composer?.heading1 || 'Heading 1'}
          >
            <Heading1 size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            tooltip={t.email?.composer?.heading2 || 'Heading 2'}
          >
            <Heading2 size={16} />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

          {/* Text formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            tooltip={t.email?.composer?.bold || 'Bold'}
          >
            <Bold size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            tooltip={t.email?.composer?.italic || 'Italic'}
          >
            <Italic size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            tooltip={t.email?.composer?.underline || 'Underline'}
          >
            <UnderlineIcon size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            tooltip={t.email?.composer?.strikethrough || 'Strikethrough'}
          >
            <Strikethrough size={16} />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            tooltip={t.email?.composer?.bulletList || 'Bullet list'}
          >
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            tooltip={t.email?.composer?.numberedList || 'Numbered list'}
          >
            <ListOrdered size={16} />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

          {/* Quote */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            tooltip={t.email?.composer?.quote || 'Quote'}
          >
            <Quote size={16} />
          </ToolbarButton>
        </Box>
      )}

      {/* Editor content */}
      <Box
        sx={{
          minHeight,
          p: 1.5,
          '& .compose-editor-content': {
            outline: 'none',
            minHeight: minHeight - 24,
            fontSize: '0.9375rem',
            lineHeight: 1.6,
            '& p': {
              margin: 0,
              marginBottom: '0.5em',
            },
            '& p:last-child': {
              marginBottom: 0,
            },
            '& h1, & h2, & h3': {
              margin: '0.5em 0',
              fontWeight: 600,
            },
            '& h1': { fontSize: '1.5em' },
            '& h2': { fontSize: '1.25em' },
            '& h3': { fontSize: '1.1em' },
            '& ul, & ol': {
              paddingLeft: '1.5em',
              margin: '0.5em 0',
            },
            '& blockquote': {
              borderLeft: '3px solid',
              borderColor: 'divider',
              paddingLeft: '1em',
              marginLeft: 0,
              marginRight: 0,
              color: 'text.secondary',
            },
            '& .is-editor-empty:first-child::before': {
              content: 'attr(data-placeholder)',
              float: 'left',
              color: 'text.disabled',
              pointerEvents: 'none',
              height: 0,
            },
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
}

export default ComposeEditor;
