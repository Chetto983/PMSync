import type { AppTranslations, LocaleKey } from './index';
import { en } from './en';
import { it } from './it';

/**
 * Application translations registry
 *
 * To add a new language:
 * 1. Create a new file (e.g., es.ts, fr.ts, de.ts) by copying en.ts
 * 2. Translate all values in the new file
 * 3. Add the locale code to LocaleKey type in index.ts
 * 4. Import and add the translations here
 */
export const appTranslations: Record<LocaleKey, AppTranslations> = {
  en,
  it,
};
