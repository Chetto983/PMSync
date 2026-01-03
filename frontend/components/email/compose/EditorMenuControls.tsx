import { useTheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import {
  MenuButtonAddTable,
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
  MenuSelectTextAlign,
  isTouchDevice,
} from 'mui-tiptap';
import { useTranslations } from '@/lib/hooks/use-translations';

export type EditorMenuControlsProps = {
  onAiCompose?: () => void;
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
          { label: 'Sans Serif', value: 'Arial, sans-serif' },
          { label: 'Serif', value: 'Georgia, serif' },
          { label: 'Monospace', value: 'monospace' },
          { label: 'Cursive', value: 'cursive' },
        ]}
      />

      <MenuDivider />

      <MenuSelectHeading />

      <MenuDivider />

      <MenuSelectFontSize />

      <MenuDivider />

      <MenuButtonBold tooltipLabel={composer.bold} />

      <MenuButtonItalic tooltipLabel={composer.italic} />

      <MenuButtonUnderline tooltipLabel={composer.underline} />

      <MenuButtonStrikethrough tooltipLabel={composer.strikethrough} />

      <MenuButtonSubscript />

      <MenuButtonSuperscript />

      <MenuDivider />

      <MenuButtonTextColor
        tooltipLabel={composer.textColor}
        defaultTextColor={theme.palette.text.primary}
        swatchColors={[
          { value: '#000000', label: 'Black' },
          { value: '#ffffff', label: 'White' },
          { value: '#888888', label: 'Grey' },
          { value: '#ff0000', label: 'Red' },
          { value: '#ff9900', label: 'Orange' },
          { value: '#ffff00', label: 'Yellow' },
          { value: '#00d000', label: 'Green' },
          { value: '#0000ff', label: 'Blue' },
        ]}
      />

      <MenuButtonHighlightColor
        tooltipLabel={composer.highlight}
        swatchColors={[
          { value: '#595959', label: 'Dark grey' },
          { value: '#dddddd', label: 'Light grey' },
          { value: '#ffa6a6', label: 'Light red' },
          { value: '#ffd699', label: 'Light orange' },
          { value: '#ffff00', label: 'Yellow' },
          { value: '#99cc99', label: 'Light green' },
          { value: '#90c6ff', label: 'Light blue' },
          { value: '#8085e9', label: 'Light purple' },
        ]}
      />

      <MenuDivider />

      <MenuButtonEditLink tooltipLabel={composer.insertLink} />

      <MenuDivider />

      <MenuSelectTextAlign />

      <MenuDivider />

      <MenuButtonOrderedList tooltipLabel={composer.numberedList} />

      <MenuButtonBulletedList tooltipLabel={composer.bulletList} />

      <MenuButtonTaskList />

      {isTouchDevice() && (
        <>
          <MenuButtonIndent />
          <MenuButtonUnindent />
        </>
      )}

      <MenuDivider />

      <MenuButtonBlockquote tooltipLabel={composer.quote} />

      <MenuDivider />

      <MenuButtonCode />

      <MenuButtonCodeBlock />

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

      <MenuButtonHorizontalRule />

      <MenuButtonAddTable />

      <MenuDivider />

      <MenuButtonRemoveFormatting />

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
