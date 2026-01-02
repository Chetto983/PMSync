/**
 * Compose Editor Component
 *
 * Tiptap-based rich text editor for email composition.
 * Supports formatting, lists, links, colors, and image handling.
 *
 * @see https://tiptap.dev/docs/editor/getting-started
 */

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  Box,
  IconButton,
  Divider,
  Tooltip,
  Popover,
  TextField,
  Button,
  Stack,
} from '@mui/material';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
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
  Link as LinkIcon,
  Unlink,
  Image as ImageIcon,
  Palette,
  Highlighter,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';

// Predefined colors for the color picker
const TEXT_COLORS = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
];

const HIGHLIGHT_COLORS = [
  '#FEF08A', '#FDE68A', '#D9F99D', '#BBF7D0',
  '#A5F3FC', '#BAE6FD', '#DDD6FE', '#FBCFE8',
];

// Toolbar button component - defined outside to avoid recreation on each render
interface ToolbarButtonProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  isActive?: boolean;
  tooltip: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, tooltip, disabled, children }: ToolbarButtonProps) {
  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton
          size="small"
          onClick={onClick}
          disabled={disabled}
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
      </span>
    </Tooltip>
  );
}

// Color picker button component
interface ColorPickerButtonProps {
  colors: string[];
  currentColor?: string;
  onSelect: (color: string) => void;
  tooltip: string;
  icon: React.ReactNode;
}

function ColorPickerButton({ colors, currentColor, onSelect, tooltip, icon }: ColorPickerButtonProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title={tooltip}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            p: 0.5,
            borderRadius: 1,
            color: currentColor || 'text.secondary',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          {icon}
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5 }}>
          {colors.map((color) => (
            <IconButton
              key={color}
              size="small"
              onClick={() => {
                onSelect(color);
                setAnchorEl(null);
              }}
              sx={{
                width: 28,
                height: 28,
                bgcolor: color,
                border: currentColor === color ? 2 : 1,
                borderColor: currentColor === color ? 'primary.main' : 'divider',
                '&:hover': { opacity: 0.8 },
              }}
            />
          ))}
        </Box>
      </Popover>
    </>
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
  /** Fill available height */
  fillHeight?: boolean;
}

/** Ref handle for external editor control */
export interface ComposeEditorRef {
  /** Get plain text content */
  getText: () => string;
  /** Get HTML content */
  getHTML: () => string;
  /** Set HTML content */
  setContent: (html: string) => void;
  /** Focus the editor */
  focus: () => void;
}

export const ComposeEditor = forwardRef<ComposeEditorRef, ComposeEditorProps>(function ComposeEditor({
  initialContent = '',
  placeholder,
  onChange,
  minHeight = 200,
  readOnly = false,
  autoFocus = false,
  fillHeight = false,
}, ref) {
  const t = useTranslations();
  // Track last set content to prevent infinite loops
  const lastSetContentRef = useRef<string>(initialContent);

  // Link dialog state
  const [linkAnchorEl, setLinkAnchorEl] = useState<HTMLElement | null>(null);
  const [linkUrl, setLinkUrl] = useState('');

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
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'compose-link',
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
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

  // Expose editor methods via ref for external control (AI compose, templates)
  useImperativeHandle(ref, () => ({
    getText: () => editor?.getText() || '',
    getHTML: () => editor?.getHTML() || '',
    setContent: (html: string) => {
      if (editor) {
        lastSetContentRef.current = html;
        editor.commands.setContent(html);
      }
    },
    focus: () => editor?.commands.focus(),
  }), [editor]);

  // Handle link insertion
  const handleInsertLink = useCallback(() => {
    if (!editor || !linkUrl) return;

    // Add https:// if no protocol
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;

    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url })
      .run();

    setLinkUrl('');
    setLinkAnchorEl(null);
  }, [editor, linkUrl]);

  // Handle image insertion from URL
  const handleInsertImage = useCallback(() => {
    if (!editor) return;

    const url = window.prompt(t.email?.composer?.imageUrlPrompt || 'Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor, t]);

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
        display: 'flex',
        flexDirection: 'column',
        height: fillHeight ? '100%' : 'auto',
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
            flexShrink: 0,
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

          {/* Colors */}
          <ColorPickerButton
            colors={TEXT_COLORS}
            currentColor={editor.getAttributes('textStyle').color}
            onSelect={(color) => editor.chain().focus().setColor(color).run()}
            tooltip={t.email?.composer?.textColor || 'Text color'}
            icon={<Palette size={16} />}
          />
          <ColorPickerButton
            colors={HIGHLIGHT_COLORS}
            currentColor={editor.getAttributes('highlight').color}
            onSelect={(color) => editor.chain().focus().toggleHighlight({ color }).run()}
            tooltip={t.email?.composer?.highlight || 'Highlight'}
            icon={<Highlighter size={16} />}
          />

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

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, height: 20, alignSelf: 'center' }} />

          {/* Link */}
          <ToolbarButton
            onClick={(e) => {
              if (editor.isActive('link')) {
                editor.chain().focus().unsetLink().run();
              } else {
                setLinkAnchorEl(e.currentTarget as HTMLElement);
              }
            }}
            isActive={editor.isActive('link')}
            tooltip={editor.isActive('link') ? (t.email?.composer?.removeLink || 'Remove link') : (t.email?.composer?.insertLink || 'Insert link')}
          >
            {editor.isActive('link') ? <Unlink size={16} /> : <LinkIcon size={16} />}
          </ToolbarButton>

          {/* Image */}
          <ToolbarButton
            onClick={handleInsertImage}
            tooltip={t.email?.composer?.insertImage || 'Insert image'}
          >
            <ImageIcon size={16} />
          </ToolbarButton>
        </Box>
      )}

      {/* Link insertion popover */}
      <Popover
        open={Boolean(linkAnchorEl)}
        anchorEl={linkAnchorEl}
        onClose={() => {
          setLinkAnchorEl(null);
          setLinkUrl('');
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Stack direction="row" spacing={1} sx={{ p: 1.5 }}>
          <TextField
            size="small"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleInsertLink();
              }
            }}
            sx={{ minWidth: 250 }}
            autoFocus
          />
          <Button
            size="small"
            variant="contained"
            onClick={handleInsertLink}
            disabled={!linkUrl}
          >
            {t.email?.composer?.insert || 'Insert'}
          </Button>
        </Stack>
      </Popover>

      {/* Editor content */}
      <Box
        sx={{
          flex: fillHeight ? 1 : 'none',
          minHeight: fillHeight ? 0 : minHeight,
          overflow: 'auto',
          p: 1.5,
          '& .compose-editor-content': {
            outline: 'none',
            minHeight: fillHeight ? '100%' : minHeight - 24,
            height: fillHeight ? '100%' : 'auto',
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
            '& a.compose-link': {
              color: 'primary.main',
              textDecoration: 'underline',
              cursor: 'pointer',
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
});

export default ComposeEditor;
