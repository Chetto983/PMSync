import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { useTranslations } from '@/lib/hooks/use-translations';

export type DraftTone = 'formal' | 'casual' | 'shorter' | 'detailed';

interface ToneSelectorProps {
  selectedTone?: DraftTone;
  onToneChange: (tone: DraftTone | undefined) => void;
  disabled?: boolean;
}

export function ToneSelector({ selectedTone, onToneChange, disabled }: ToneSelectorProps) {
  const t = useTranslations();

  const tones: { key: DraftTone; label: string }[] = [
    { key: 'formal', label: t.email.aiDraft.toneFormal },
    { key: 'casual', label: t.email.aiDraft.toneCasual },
    { key: 'shorter', label: t.email.aiDraft.toneShorter },
    { key: 'detailed', label: t.email.aiDraft.toneDetailed },
  ];

  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      {tones.map(({ key, label }) => (
        <Chip
          key={key}
          label={label}
          size="small"
          variant={selectedTone === key ? 'filled' : 'outlined'}
          color={selectedTone === key ? 'primary' : 'default'}
          onClick={() => onToneChange(selectedTone === key ? undefined : key)}
          disabled={disabled}
          sx={{ height: 24, fontSize: '0.75rem' }}
        />
      ))}
    </Stack>
  );
}
