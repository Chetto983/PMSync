import { Extension } from '@tiptap/core';

export interface AiShortcutOptions {
  onTriggerAi: () => void;
}

/**
 * TipTap extension that registers Cmd+J (Mac) / Ctrl+J (Windows) keyboard shortcut
 * to trigger the AI compose menu. Returns true to prevent browser default
 * (Chrome uses Ctrl+J for downloads bar).
 */
export const AiShortcutExtension = Extension.create<AiShortcutOptions>({
  name: 'aiShortcut',

  addOptions() {
    return {
      onTriggerAi: () => {},
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-j': () => {
        this.options.onTriggerAi();
        return true; // Prevent browser default (Chrome downloads bar)
      },
    };
  },
});
