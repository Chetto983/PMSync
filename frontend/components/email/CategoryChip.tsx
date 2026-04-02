import { memo } from 'react';
import Chip from '@mui/material/Chip';
import { useTranslations } from '@/lib/hooks/use-translations';

type EmailCategory = 'support' | 'sales' | 'internal' | 'newsletter';

const CATEGORY_COLORS: Record<EmailCategory, 'warning' | 'success' | 'info' | 'default'> = {
  support: 'warning',    // orange (per D-22)
  sales: 'success',      // green (per D-22)
  internal: 'info',      // blue (per D-22)
  newsletter: 'default', // gray (per D-22)
};

interface CategoryChipProps {
  category: string | null | undefined;
}

export const CategoryChip = memo<CategoryChipProps>(function CategoryChip({ category }) {
  const t = useTranslations();

  if (!category || !CATEGORY_COLORS[category as EmailCategory]) {
    return null;
  }

  const cat = category as EmailCategory;
  const label = t.email.category[cat];
  const color = CATEGORY_COLORS[cat];

  return (
    <Chip
      label={label}
      color={color}
      size="small"
      variant="outlined"
      sx={{ height: 20, fontSize: '0.7rem', fontWeight: 500 }}
    />
  );
});
