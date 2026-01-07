import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import {
  MenuButtonAddTable,
  MenuButtonAlignCenter,
  MenuButtonAlignJustify,
  MenuButtonAlignLeft,
  MenuButtonAlignRight,
  MenuButtonBlockquote,
  MenuButtonBold,
  MenuButtonBulletedList,
  MenuButtonCode,
  MenuButtonCodeBlock,
  MenuButtonEditLink,
  MenuButtonHighlightColor,
  MenuButtonHorizontalRule,
  MenuButtonImageUpload,
  MenuButtonIndent,
  MenuButtonItalic,
  MenuButtonOrderedList,
  MenuButtonRedo,
  MenuButtonRemoveFormatting,
  MenuButtonStrikethrough,
  MenuButtonSubscript,
  MenuButtonSuperscript,
  MenuButtonTaskList,
  MenuButtonTextColor,
  MenuButtonUnderline,
  MenuButtonUndo,
  MenuButtonUnindent,
  MenuControlsContainer,
  MenuDivider,
  MenuSelectFontFamily,
  MenuSelectFontSize,
  MenuSelectHeading,
  isTouchDevice,
} from 'mui-tiptap';
import { useTranslations } from '@/lib/hooks/use-translations';

export type EditorMenuControlsProps = {
  onAiCompose?: (event: React.MouseEvent<HTMLElement>) => void;
  onAttach?: () => void;
};

export default function EditorMenuControls({ onAiCompose, onAttach }: EditorMenuControlsProps) {
  const theme = useTheme();
  const t = useTranslations();
  const composer = t.email.composer;

  return (
    <MenuControlsContainer>
      {/* AI Compose Button */}
      {onAiCompose && (
        <>
          <Tooltip title={composer.aiCompose}>
            <IconButton
              size="small"
              onClick={onAiCompose}
              sx={{
                color: 'primary.main',
                '&:hover': {
                  bgcolor: 'primary.light',
                  color: 'primary.contrastText',
                },
              }}
            >
              <AutoAwesomeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <MenuDivider />
        </>
      )}

      <MenuSelectFontFamily
        options={[
          { label: composer.fontSansSerif, value: 'Arial, sans-serif' },
          { label: composer.fontSerif, value: 'Georgia, serif' },
          { label: composer.fontMonospace, value: 'monospace' },
          { label: composer.fontCursive, value: 'cursive' },
        ]}
      />

      <MenuDivider />

      <MenuSelectHeading
        labels={{
          paragraph: composer.headingParagraph,
          heading1: composer.heading1,
          heading2: composer.heading2,
          heading3: composer.heading3,
          heading4: composer.heading4,
          heading5: composer.heading5,
          heading6: composer.heading6,
        }}
      />

      <MenuDivider />

      <MenuSelectFontSize
        unsetOptionLabel={composer.fontSizeDefault}
      />

      <MenuDivider />

      <MenuButtonBold tooltipLabel={composer.bold} />

      <MenuButtonItalic tooltipLabel={composer.italic} />

      <MenuButtonUnderline tooltipLabel={composer.underline} />

      <MenuButtonStrikethrough tooltipLabel={composer.strikethrough} />

      <MenuButtonSubscript tooltipLabel={composer.subscript} />

      <MenuButtonSuperscript tooltipLabel={composer.superscript} />

      <MenuDivider />

      <MenuButtonTextColor
        tooltipLabel={composer.textColor}
        defaultTextColor={theme.palette.text.primary}
        swatchColors={[
          { value: '#000000', label: composer.colorBlack },
          { value: '#ffffff', label: composer.colorWhite },
          { value: '#888888', label: composer.colorGrey },
          { value: '#ff0000', label: composer.colorRed },
          { value: '#ff9900', label: composer.colorOrange },
          { value: '#ffff00', label: composer.colorYellow },
          { value: '#00d000', label: composer.colorGreen },
          { value: '#0000ff', label: composer.colorBlue },
        ]}
        labels={{
          cancelButton: composer.colorPickerCancel,
          saveButton: composer.colorPickerSave,
          removeColorButton: composer.colorPickerReset,
          removeColorButtonTooltipTitle: composer.colorPickerRemove,
          textFieldPlaceholder: composer.colorPickerPlaceholder,
        }}
      />

      <MenuButtonHighlightColor
        tooltipLabel={composer.highlight}
        swatchColors={[
          { value: '#595959', label: composer.colorDarkGrey },
          { value: '#dddddd', label: composer.colorLightGrey },
          { value: '#ffa6a6', label: composer.colorLightRed },
          { value: '#ffd699', label: composer.colorLightOrange },
          { value: '#ffff00', label: composer.colorYellow },
          { value: '#99cc99', label: composer.colorLightGreen },
          { value: '#90c6ff', label: composer.colorLightBlue },
          { value: '#8085e9', label: composer.colorLightPurple },
        ]}
        labels={{
          cancelButton: composer.colorPickerCancel,
          saveButton: composer.colorPickerSave,
          removeColorButton: composer.colorPickerReset,
          removeColorButtonTooltipTitle: composer.colorPickerRemove,
          textFieldPlaceholder: composer.colorPickerPlaceholder,
        }}
      />

      <MenuDivider />

      <MenuButtonEditLink tooltipLabel={composer.insertLink} />

      <MenuDivider />

      <MenuButtonAlignLeft tooltipLabel={composer.alignLeft} />

      <MenuButtonAlignCenter tooltipLabel={composer.alignCenter} />

      <MenuButtonAlignRight tooltipLabel={composer.alignRight} />

      <MenuButtonAlignJustify tooltipLabel={composer.alignJustify} />

      <MenuDivider />

      <MenuButtonOrderedList tooltipLabel={composer.numberedList} />

      <MenuButtonBulletedList tooltipLabel={composer.bulletList} />

      <MenuButtonTaskList tooltipLabel={composer.taskList} />

      {isTouchDevice() && (
        <>
          <MenuButtonIndent tooltipLabel={composer.indent} />
          <MenuButtonUnindent tooltipLabel={composer.unindent} />
        </>
      )}

      <MenuDivider />

      <MenuButtonBlockquote tooltipLabel={composer.quote} />

      <MenuDivider />

      <MenuButtonCode tooltipLabel={composer.code} />

      <MenuButtonCodeBlock tooltipLabel={composer.codeBlock} />

      <MenuDivider />

      <MenuButtonImageUpload
        tooltipLabel={composer.insertImage}
        onUploadFiles={(files) =>
          files.map((file) => ({
            src: URL.createObjectURL(file),
            alt: file.name,
          }))
        }
      />

      <MenuDivider />

      <MenuButtonHorizontalRule tooltipLabel={composer.horizontalRule} />

      <MenuButtonAddTable tooltipLabel={composer.addTable} />

      <MenuDivider />

      <MenuButtonRemoveFormatting tooltipLabel={composer.removeFormatting} />

      <MenuDivider />

      <MenuButtonUndo tooltipLabel={composer.undo} />
      <MenuButtonRedo tooltipLabel={composer.redo} />

      {onAttach && (
        <>
          <MenuDivider />
          <Tooltip title={composer.attachFiles}>
            <IconButton
              size="small"
              onClick={onAttach}
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  bgcolor: 'action.hover',
                },
              }}
            >
              <AttachFileIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}
    </MenuControlsContainer>
  );
}
