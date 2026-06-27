import { useEffect } from 'react';

type Handler = () => void;

interface ShortcutMap {
  [combo: string]: Handler;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && key === 'n') {
        e.preventDefault();
        shortcuts['ctrl+n']?.();
        return;
      }
      if (ctrl && key === 'k') {
        e.preventDefault();
        shortcuts['ctrl+k']?.();
        return;
      }
      if (ctrl && key === 'f') {
        e.preventDefault();
        shortcuts['ctrl+f']?.();
        return;
      }
      if (ctrl && key === 'e') {
        e.preventDefault();
        shortcuts['ctrl+e']?.();
        return;
      }
      if (key === 'escape') {
        shortcuts.escape?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts, enabled]);
}
