import type { EditorOptions } from '@tiptap/core';
import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  LinkBubbleMenu,
  RichTextEditor,
  TableBubbleMenu,
  insertImages,
  type RichTextEditorRef,
} from 'mui-tiptap';
import { useTranslations } from '@/lib/hooks/use-translations';
import { aiApi, type CommunicationStyle } from '@/lib/api/ai';
import { useAuthStore } from '@/stores/auth-store';
import { useAiProfile } from '@/hooks/queries/use-settings';
import EditorMenuControls from './EditorMenuControls';
import useExtensions from './useExtensions';
import logger from '@/lib/logger';
import AiComposeMenu, { type AiActionType } from './AiComposeMenu';

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
  placeholder,
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
  const { locale } = useRouter();
  const composer = t.email.composer;
  const user = useAuthStore((state) => state.user);
  const { data: aiProfile } = useAiProfile();

  // Map CommunicationStyle → compose tone parameter
  const mapCommunicationStyleToTone = (style?: CommunicationStyle): string => {
    switch (style) {
      case 'FORMAL': return 'formal';
      case 'CASUAL': return 'casual';
      case 'TECHNICAL': return 'professional';
      case 'CREATIVE': return 'friendly';
      default: return 'professional';
    }
  };

  // Build sender name from user info
  const senderName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined;

  // Use provided placeholder or fallback to translation
  const editorPlaceholder = placeholder || composer.bodyPlaceholder;

  const extensions = useExtensions({
    placeholder: editorPlaceholder,
  });
  const rteRef = useRef<RichTextEditorRef>(null);
  // Inline AI state
  const [showAiPanel, setShowAiPanel] = useState(false);
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

  const [aiMenuAnchor, setAiMenuAnchor] = useState<HTMLElement | null>(null);

  // Open AI Menu
  const handleOpenAiMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const selection = getSelectedHtml();
    const hasSelection = selection && selection.length > 0;

    setSelectedText(selection);
    setIsModifyMode(hasSelection || false);
    setAiMenuAnchor(event.currentTarget);
  }, [getSelectedHtml]);

  const handleCloseAiMenu = useCallback(() => {
    setAiMenuAnchor(null);
  }, []);

  // Handle AI Composition from Menu
  const handleAiCompose = useCallback(async (prompt: string, actionType: AiActionType) => {
    handleCloseAiMenu();
    setShowAiPanel(true); // Show the review panel
    setAiIsLoading(true);
    setAiContent(null);

    const aiMenu = composer.aiMenu;
    // Target language name in user's locale for clear AI instruction
    const targetLanguage = locale?.startsWith('it') ? 'italiano' : 'English';

    try {
      let contextPrompt: string;

      // Construct Prompt based on Action & Selection - using localized instructions
      if (selectedText && isModifyMode) {
        // Refinement Mode - use localized instructions
        let instruction = prompt;
        if (actionType === 'fix_spelling') instruction = aiMenu.fixSpellingInstruction;
        if (actionType === 'shorten') instruction = aiMenu.shortenInstruction;
        if (actionType === 'expand') instruction = aiMenu.expandInstruction;
        if (actionType === 'tone_professional') instruction = aiMenu.professionalInstruction;
        if (actionType === 'tone_friendly') instruction = aiMenu.friendlyInstruction;

        contextPrompt = `${instruction}\n\n${aiMenu.modifySelectedText}\n${selectedText}\n\n${aiMenu.returnModifiedText} ${targetLanguage}.`;
      } else {
        // Drafting Mode (New)
        contextPrompt = `${prompt}\n\n${aiMenu.writeEmailIn} ${targetLanguage}.`;
      }

      const response = await aiApi.composeEmail({
        prompt: contextPrompt,
        to: recipients,
        subject: subject || undefined,
        tone: mapCommunicationStyleToTone(aiProfile?.communicationStyle),
        locale: locale || 'en',
        senderName,
        // TODO: signature will come from user settings once signature editor is implemented
      });

      if (response.data.success && response.data.body) {
        let formattedBody = response.data.body;
        if (!formattedBody.includes('<p>') && !formattedBody.includes('<br')) {
          formattedBody = formattedBody
            .split('\n\n')
            .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
        }
        setAiContent(formattedBody);
      }
    } catch (err) {
      logger.error('AI compose error', err instanceof Error ? err : new Error(String(err)));
      setAiContent(`<p style="color: red;">${composer.aiComposeError}</p>`);
    } finally {
      setAiIsLoading(false);
    }
  }, [selectedText, isModifyMode, recipients, subject, locale, senderName, handleCloseAiMenu, composer, aiProfile, mapCommunicationStyleToTone]);

  // Close AI Result Panel
  const handleCloseAiPanel = useCallback(() => {
    setShowAiPanel(false);
    setAiContent(null);
    setSelectedText(null);
    setIsModifyMode(false);
  }, []);

  // ... (rest of the file)

  // Accept AI content - replace selection or insert at cursor
  const handleAcceptAiContent = useCallback(() => {
    if (aiContent && rteRef.current?.editor) {
      const editor = rteRef.current.editor;

      if (isModifyMode && selectedText) {
        // Replace the selected text with AI content
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

  return (
    <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
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
          <EditorMenuControls onAiCompose={handleOpenAiMenu} onAttach={onAttach} />
        )}
        RichTextFieldProps={{
          variant: 'outlined',
          MenuBarProps: {
            hide: false,
          },
          sx: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            '& .MuiInputBase-root': {
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
            },
            '& .MuiInputBase-input': {
              flex: 1,
              overflow: 'auto',
              height: '100% !important',
            }
          }
        }}
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          '& .ProseMirror': {
            minHeight: typeof minHeight === 'number' ? minHeight : '100%',
            height: '100%',
            outline: 'none',
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              scrollMarginTop: 50,
            },
            padding: 2,
          },
          // Ensure container takes full height
          '& .MuiRichTextEditor-container': {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
          },
          '& .MuiRichTextEditor-content': {
            flex: 1,
            overflowY: 'auto',
          }
        }}
      >
        {() => (
          <>
            <LinkBubbleMenu />
            <TableBubbleMenu
              labels={{
                insertColumnBefore: composer.tableInsertColumnBefore,
                insertColumnAfter: composer.tableInsertColumnAfter,
                deleteColumn: composer.tableDeleteColumn,
                insertRowAbove: composer.tableInsertRowBefore,
                insertRowBelow: composer.tableInsertRowAfter,
                deleteRow: composer.tableDeleteRow,
                mergeCells: composer.tableMergeCells,
                splitCell: composer.tableSplitCell,
                toggleHeaderRow: composer.tableToggleHeaderRow,
                toggleHeaderColumn: composer.tableToggleHeaderColumn,
                toggleHeaderCell: composer.tableToggleHeaderCell,
                deleteTable: composer.tableDeleteTable,
              }}
            />
          </>
        )}
      </RichTextEditor>

      <AiComposeMenu
        anchorEl={aiMenuAnchor}
        open={Boolean(aiMenuAnchor)}
        onClose={handleCloseAiMenu}
        onCompose={handleAiCompose}
        isLoading={aiIsLoading}
        hasSelection={Boolean(selectedText && isModifyMode)}
      />

      {/* Inline AI Result Panel - Review only */}
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
              {composer.aiComposeTitle}
            </Typography>
            <IconButton size="small" onClick={handleCloseAiPanel} sx={{ color: 'inherit' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* AI Generated Content Preview */}
          <Box
            sx={{
              maxHeight: 200,
              overflow: 'auto',
              px: 2,
              py: 2,
              bgcolor: 'grey.50',
            }}
          >
            {aiIsLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 2 }}>
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
          {!aiIsLoading && aiContent && (
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
        </Paper>
      </Collapse>
    </Box>
  );
}
