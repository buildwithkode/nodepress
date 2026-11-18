'use client';

import { useEffect } from 'react';

/**
 * Cmd+S (Mac) / Ctrl+S (Windows, Linux) saves the current screen.
 *
 * Mounted once in the admin layout. Screens opt in by putting
 * `data-save-shortcut` on their main save button; the shortcut clicks it, so
 * validation, "saving…" states and confirm dialogs work exactly as with the
 * mouse. The browser's own "Save page as…" never opens inside the admin.
 *
 * Which button: while a dialog is open, only buttons inside the top dialog
 * (none → nothing happens, so the page underneath isn't saved by surprise).
 * Otherwise the marked button nearest the focused field, else the first one.
 * A disabled button (nothing changed, already saving) means nothing happens.
 */
const SELECTOR = '[data-save-shortcut]';

const isVisible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
const isEnabled = (el: HTMLElement) =>
  !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('data-disabled');

function dialogOpen(): HTMLElement | null {
  const open = [...document.querySelectorAll<HTMLElement>('[role=dialog], [role=alertdialog]')].filter(isVisible);
  return open[open.length - 1] ?? null;
}

function pickButton(): HTMLElement | null {
  const scope: ParentNode = dialogOpen() ?? document;
  const buttons = [...scope.querySelectorAll<HTMLElement>(SELECTOR)].filter(isVisible);
  if (!buttons.length) return null;
  for (let node = document.activeElement as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    const near = buttons.find((b) => node!.contains(b));
    if (near) return near;
  }
  return buttons[0];
}

export function SaveShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.isComposing) return;
      if (e.code !== 'KeyS' && e.key?.toLowerCase() !== 's') return;
      e.preventDefault();
      if (e.repeat) return;
      const button = pickButton();
      if (!button || !isEnabled(button)) return;
      // Like a mouse click on the button: the field being edited loses focus
      // first, so inputs that commit their value on blur are saved too.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
      setTimeout(() => {
        button.click();
        // Put the caret back in a plain text field, unless a dialog opened.
        if ((focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) && focused.isConnected) {
          setTimeout(() => { if (!dialogOpen() && document.activeElement === document.body) focused.focus({ preventScroll: true }); }, 50);
        }
      }, 0);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
  return null;
}
