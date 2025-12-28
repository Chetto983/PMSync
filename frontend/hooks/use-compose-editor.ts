import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
// Note: Underline is included in tiptap-markdown - don't import separately
import { Markdown } from 'tiptap-markdown';
import { FileHandler } from '@tiptap/extension-file-handler';

interface UseComposeEditorProps {
  /**
   * Initial HTML content
   */
  initialContent?: string;

  /**
   * Placeholder text
   */
  placeholder?: string;

  /**
   * Callback when content changes
   */
  onChange?: (html: string) => void;

  /**
   * Autofocus on mount
   */
  autofocus?: boolean;

  /**
   * Read-only mode
   */
  editable?: boolean;
}

/**
 * Hook for TipTap editor in email composition
 *
 * Features:
 * - Rich text formatting (bold, italic, underline, etc.)
 * - Markdown support
 * - Image drag & drop
 * - Placeholder text
 * - HTML output
 */
export function useComposeEditor({
  initialContent = '',
  placeholder = 'Compose your message...',
  onChange,
  autofocus = false,
  editable = true,
}: UseComposeEditorProps = {}): Editor | null {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      // Underline is provided by tiptap-markdown
      Placeholder.configure({
        placeholder,
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Markdown,
      FileHandler.configure({
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
        onDrop: (currentEditor, files, pos) => {
          files.forEach((file) => {
            const fileReader = new FileReader();

            fileReader.readAsDataURL(file);
            fileReader.onload = () => {
              currentEditor
                .chain()
                .insertContentAt(pos, {
                  type: 'image',
                  attrs: {
                    src: fileReader.result,
                  },
                })
                .focus()
                .run();
            };
          });
        },
        onPaste: (currentEditor, files) => {
          files.forEach((file) => {
            const fileReader = new FileReader();

            fileReader.readAsDataURL(file);
            fileReader.onload = () => {
              currentEditor
                .chain()
                .insertContentAt(currentEditor.state.selection.anchor, {
                  type: 'image',
                  attrs: {
                    src: fileReader.result,
                  },
                })
                .focus()
                .run();
            };
          });
        },
      }),
    ],
    content: initialContent,
    editable,
    autofocus: autofocus ? 'end' : false,
    immediatelyRender: false, // Prevent SSR hydration mismatch
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none min-h-[200px] px-3 py-2',
        dir: 'ltr', // Force left-to-right text direction
      },
    },
  });

  return editor;
}
