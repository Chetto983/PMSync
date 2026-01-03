import type { EditorOptions } from '@tiptap/core';
import { useCallback, useRef } from 'react';
import {
  LinkBubbleMenu,
  RichTextEditor,
  TableBubbleMenu,
  insertImages,
  type RichTextEditorRef,
} from 'mui-tiptap';
import EditorMenuControls from './EditorMenuControls';
import useExtensions from './useExtensions';

function fileListToImageFiles(fileList: FileList): File[] {
  return Array.from(fileList).filter((file) => {
    const mimeType = (file.type || '').toLowerCase();
    return mimeType.startsWith('image/');
  });
}

export type ComposeEditorProps = {
  placeholder?: string;
  content?: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  minHeight?: number | string;
  onAiCompose?: () => void;
  onAttach?: () => void;
};

export default function ComposeEditor({
  placeholder = 'Write your message...',
  content = '',
  onChange,
  editable = true,
  minHeight = 200,
  onAiCompose,
  onAttach,
}: ComposeEditorProps) {
  const extensions = useExtensions({
    placeholder,
  });
  const rteRef = useRef<RichTextEditorRef>(null);

  const handleNewImageFiles = useCallback(
    (files: File[], insertPosition?: number): void => {
      if (!rteRef.current?.editor) {
        return;
      }

      const attributesForImageFiles = files.map((file) => ({
        src: URL.createObjectURL(file),
        alt: file.name,
      }));

      insertImages({
        images: attributesForImageFiles,
        editor: rteRef.current.editor,
        position: insertPosition,
      });
    },
    [],
  );

  const handleDrop: NonNullable<EditorOptions['editorProps']['handleDrop']> =
    useCallback(
      (view, event, _slice, _moved) => {
        if (!(event instanceof DragEvent) || !event.dataTransfer) {
          return false;
        }

        const imageFiles = fileListToImageFiles(event.dataTransfer.files);
        if (imageFiles.length > 0) {
          const insertPosition = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;

          handleNewImageFiles(imageFiles, insertPosition);
          event.preventDefault();
          return true;
        }

        return false;
      },
      [handleNewImageFiles],
    );

  const handlePaste: NonNullable<EditorOptions['editorProps']['handlePaste']> =
    useCallback(
      (_view, event, _slice) => {
        if (!event.clipboardData) {
          return false;
        }

        const pastedImageFiles = fileListToImageFiles(
          event.clipboardData.files,
        );
        if (pastedImageFiles.length > 0) {
          handleNewImageFiles(pastedImageFiles);
          return true;
        }

        return false;
      },
      [handleNewImageFiles],
    );

  return (
    <RichTextEditor
      ref={rteRef}
      extensions={extensions}
      content={content}
      editable={editable}
      immediatelyRender={false}
      editorProps={{
        handleDrop: handleDrop,
        handlePaste: handlePaste,
      }}
      onUpdate={({ editor }) => {
        if (onChange) {
          onChange(editor.getHTML());
        }
      }}
      renderControls={() => <EditorMenuControls onAiCompose={onAiCompose} onAttach={onAttach} />}
      RichTextFieldProps={{
        variant: 'outlined',
        MenuBarProps: {
          hide: false,
        },
      }}
      sx={{
        '& .ProseMirror': {
          minHeight,
          '& h1, & h2, & h3, & h4, & h5, & h6': {
            scrollMarginTop: 50,
          },
        },
      }}
    >
      {() => (
        <>
          <LinkBubbleMenu />
          <TableBubbleMenu />
        </>
      )}
    </RichTextEditor>
  );
}
