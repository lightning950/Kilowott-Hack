import { useEffect, useRef } from "react";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/**
 * Global keyboard shortcut. `combo` is a key ("n", "/") or "mod+k" (⌘ on Mac, Ctrl elsewhere).
 * Plain keys are ignored while the user is typing in a field.
 */
export const useHotkey = (combo: string, handler: (e: KeyboardEvent) => void, enabled = true) => {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const wantsMod = combo.startsWith("mod+");
    const key = combo.replace("mod+", "").toLowerCase();
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      const mod = e.metaKey || e.ctrlKey;
      if (wantsMod !== mod || e.altKey) return;
      if (!wantsMod && isTyping(e.target)) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, enabled]);
};
