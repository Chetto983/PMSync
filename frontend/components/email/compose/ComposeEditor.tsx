import type { EditorOptions } from '@tiptap/core';
import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Collapse from '@mui/material/Collapse';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  LinkBubbleMenu,
  RichTextEditor,
  TableBubbleMenu,
  insertImages,
  type RichTextEditorRef,
} from 'mui-tiptap';
import { useTranslations } from '@/lib/hooks/use-translations';
import { aiApi } from '@/lib/api/ai';
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
  recipients?: string[];
  subject?: string;
};

export default function ComposeEditor({
  placeholder = 'Write your message...',
  content = '',
  onChange,
  editable = true,
  minHeight = 200,
  onAiCompose: _onAiCompose,
  onAttach,
  recipients = [],
  subject = '',
}: ComposeEditorProps) {
  const t = useTranslations();
  const composer = t.email.composer;

  const extensions = useExtensions({
    placeholder,
  });
  const rteRef = useRef<RichTextEditorRef>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inline AI state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [aiIsLoading, setAiIsLoading] = useState(false);
  // Track selected text for modification
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [isModifyMode, setIsModifyMode] = useState(false);

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

  // Helper to get selected HTML from editor
  const getSelectedHtml = useCallback((): string | null => {
    const editor = rteRef.current?.editor;
    if (!editor) return null;

    const { from, to } = editor.state.selection;
    if (from === to) return null; // No selection

    // Get selected text as HTML
    const slice = editor.state.doc.slice(from, to);
    const fragment = slice.content;

    // Extract text content from selection
    let text = '';
    fragment.forEach((node) => {
      text += node.textContent || '';
    });

    return text.trim() || null;
  }, []);

  // Open AI panel - capture selection if any
  const handleOpenAiPanel = useCallback(() => {
    const selection = getSelectedHtml();
    const hasSelection = selection && selection.length > 0;

    setSelectedText(selection);
    setIsModifyMode(hasSelection || false);
    setShowAiPanel(true);
    setAiContent(null);
    setAiInstruction('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [getSelectedHtml]);

  // Close AI panel
  const handleCloseAiPanel = useCallback(() => {
    setShowAiPanel(false);
    setAiContent(null);
    setAiInstruction('');
    setSelectedText(null);
    setIsModifyMode(false);
  }, []);

  // Send instruction to AI
  const handleSendInstruction = useCallback(async () => {
    if (!aiInstruction.trim()) return;

    setAiIsLoading(true);

    try {
      // Build context-aware prompt
      let contextPrompt: string;

      if (aiContent) {
        // Iterative refinement - modify AI's previous output
        contextPrompt = `Modify this email based on the instruction: "${aiInstruction}"\n\nCurrent email:\n${aiContent}`;
      } else if (selectedText && isModifyMode) {
        // Modify user's selected text
        contextPrompt = `Modify the following text based on the instruction: "${aiInstruction}"\n\nSelected text to modify:\n${selectedText}\n\nKeep the same meaning but apply the requested changes. Return only the modified text.`;
      } else {
        // New composition
        contextPrompt = aiInstruction;
      }

      const response = await aiApi.composeEmail({
        prompt: contextPrompt,
        to: recipients,
        subject: subject || undefined,
        locale: t.locale,
      });

      if (response.data.success && response.data.body) {
        let formattedBody = response.data.body;
        // Format as HTML paragraphs if plain text
        if (!formattedBody.includes('<p>') && !formattedBody.includes('<br')) {
          formattedBody = formattedBody
            .split('\n\n')
            .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
        }
        setAiContent(formattedBody);
      }
    } catch (err) {
      console.error('AI compose error:', err);
    } finally {
      setAiIsLoading(false);
      setAiInstruction('');
    }
  }, [aiInstruction, aiContent, selectedText, isModifyMode, recipients, subject, t.locale]);

  // Accept AI content - replace selection or insert at cursor
  const handleAcceptAiContent = useCallback(() => {
    if (aiContent && rteRef.current?.editor) {
      const editor = rteRef.current.editor;

      if (isModifyMode && selectedText) {
        // Replace the selected text with AI content
        // The selection should still be active, so deleteSelection + insert works
        editor
          .chain()
          .focus()
          .deleteSelection()
          .insertContent(aiContent)
          .run();
      } else {
        // Insert at cursor position for new composition
        editor.chain().focus().insertContent(aiContent).run();
      }

      if (onChange) {
        onChange(editor.getHTML());
      }
    }
    handleCloseAiPanel();
  }, [aiContent, isModifyMode, selectedText, onChange, handleCloseAiPanel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInstruction();
    }
    if (e.key === 'Escape') {
      handleCloseAiPanel();
    }
  };

  return (
    <Box sx={{ position: 'relative' }}>
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
        renderControls={() => (
          <EditorMenuControls onAiCompose={handleOpenAiPanel} onAttach={onAttach} />
        )}
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

      {/* Inline AI Panel - appears below editor */}
      <Collapse in={showAiPanel}>
        <Paper
          elevation={0}
          sx={{
            mt: 1,
            border: 1,
            borderColor: 'primary.light',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {/* AI Header */}
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
            <AutoAwesomeIcon fontSize="small" />
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              {isModifyMode ? composer.aiModifyTitle : composer.aiComposeTitle}
            </Typography>
            <IconButton size="small" onClick={handleCloseAiPanel} sx={{ color: 'inherit' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Show selected text preview when modifying */}
          {isModifyMode && selectedText && !aiContent && !aiIsLoading && (
            <Box
              sx={{
                px: 2,
                py: 1,
                bgcolor: 'action.hover',
                borderBottom: 1,
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                {composer.aiModifySelectedText}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontStyle: 'italic',
                  maxHeight: 60,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                &ldquo;{selectedText}&rdquo;
              </Typography>
            </Box>
          )}

          {/* Instruction Input */}
          <Box sx={{ p: 1.5 }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              size="small"
              placeholder={
                aiContent
                  ? composer.aiChatPlaceholder
                  : isModifyMode
                    ? composer.aiModifyPlaceholder
                    : composer.aiComposePlaceholderCompose
              }
              value={aiInstruction}
              onChange={(e) => setAiInstruction(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={aiIsLoading}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={handleSendInstruction}
                        disabled={aiIsLoading || !aiInstruction.trim()}
                        color="primary"
                      >
                        {aiIsLoading ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
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

          {/* AI Generated Content Preview */}
          {(aiContent || aiIsLoading) && (
            <>
              <Box
                sx={{
                  maxHeight: 180,
                  overflow: 'auto',
                  px: 2,
                  py: 1.5,
                  bgcolor: 'grey.50',
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                {aiIsLoading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 3 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                      {composer.aiComposeGenerating}
                    </Typography>
                  </Box>
                ) : (
                  <Typography
                    variant="body2"
                    component="div"
                    sx={{
                      '& p': { mb: 1, '&:last-child': { mb: 0 } },
                      lineHeight: 1.6,
                    }}
                    dangerouslySetInnerHTML={{ __html: aiContent || '' }}
                  />
                )}
              </Box>

              {/* Action Buttons */}
              {aiContent && !aiIsLoading && (
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
                    onClick={handleCloseAiPanel}
                    startIcon={<CloseIcon fontSize="small" />}
                  >
                    {composer.aiComposeReject}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    onClick={handleAcceptAiContent}
                    startIcon={<CheckIcon fontSize="small" />}
                  >
                    {composer.aiComposeAccept}
                  </Button>
                </Box>
              )}
            </>
          )}
        </Paper>
      </Collapse>
    </Box>
  );
}
