import { useEffect } from 'react';
import { performAction, type ActionId } from '../midi/actions';
import type { DeckId } from '../engine/types';
import { useUi } from '@/store/ui';

export interface KeyBinding {
  key: string; // KeyboardEvent.code or key
  action: ActionId;
  deck?: DeckId;
  label: string;
  shift?: boolean;
}

/** VirtualDJ-like default keymap. Left hand = deck A, right hand = deck B. */
export const DEFAULT_KEYMAP: KeyBinding[] = [
  { key: 'KeyQ', action: 'deck.play', deck: 'A', label: 'Play/Pause A' },
  { key: 'KeyW', action: 'deck.play', deck: 'B', label: 'Play/Pause B' },
  { key: 'KeyA', action: 'deck.cue', deck: 'A', label: 'Cue A' },
  { key: 'KeyS', action: 'deck.cue', deck: 'B', label: 'Cue B' },
  { key: 'KeyZ', action: 'deck.sync', deck: 'A', label: 'Sync A' },
  { key: 'KeyX', action: 'deck.sync', deck: 'B', label: 'Sync B' },
  { key: 'Digit1', action: 'deck.hotcue.1', deck: 'A', label: 'Hot cue A1' },
  { key: 'Digit2', action: 'deck.hotcue.2', deck: 'A', label: 'Hot cue A2' },
  { key: 'Digit3', action: 'deck.hotcue.3', deck: 'A', label: 'Hot cue A3' },
  { key: 'Digit4', action: 'deck.hotcue.4', deck: 'A', label: 'Hot cue A4' },
  { key: 'Digit7', action: 'deck.hotcue.1', deck: 'B', label: 'Hot cue B1' },
  { key: 'Digit8', action: 'deck.hotcue.2', deck: 'B', label: 'Hot cue B2' },
  { key: 'Digit9', action: 'deck.hotcue.3', deck: 'B', label: 'Hot cue B3' },
  { key: 'Digit0', action: 'deck.hotcue.4', deck: 'B', label: 'Hot cue B4' },
  { key: 'KeyE', action: 'deck.loop.toggle', deck: 'A', label: 'Loop A' },
  { key: 'KeyR', action: 'deck.loop.halve', deck: 'A', label: 'Loop ½ A' },
  { key: 'KeyT', action: 'deck.loop.double', deck: 'A', label: 'Loop ×2 A' },
  { key: 'KeyU', action: 'deck.loop.halve', deck: 'B', label: 'Loop ½ B' },
  { key: 'KeyI', action: 'deck.loop.double', deck: 'B', label: 'Loop ×2 B' },
  { key: 'KeyO', action: 'deck.loop.toggle', deck: 'B', label: 'Loop B' },
  { key: 'KeyD', action: 'deck.bend.down', deck: 'A', label: 'Bend − A' },
  { key: 'KeyF', action: 'deck.bend.up', deck: 'A', label: 'Bend + A' },
  { key: 'KeyJ', action: 'deck.bend.down', deck: 'B', label: 'Bend − B' },
  { key: 'KeyK', action: 'deck.bend.up', deck: 'B', label: 'Bend + B' },
  { key: 'KeyC', action: 'deck.censor', deck: 'A', label: 'Censor A' },
  { key: 'KeyV', action: 'deck.censor', deck: 'B', label: 'Censor B' },
  { key: 'KeyG', action: 'deck.slip', deck: 'A', label: 'Slip A' },
  { key: 'KeyH', action: 'deck.slip', deck: 'B', label: 'Slip B' },
  { key: 'ArrowUp', action: 'browser.up', label: 'Browse up' },
  { key: 'ArrowDown', action: 'browser.down', label: 'Browse down' },
  { key: 'ArrowLeft', action: 'deck.load', deck: 'A', label: 'Load selected → A', shift: true },
  { key: 'ArrowRight', action: 'deck.load', deck: 'B', label: 'Load selected → B', shift: true },
  { key: 'Enter', action: 'browser.loadFocused', label: 'Load selected → focused deck' },
  { key: 'Space', action: 'deck.play', label: 'Play/Pause focused deck' },
  { key: 'KeyL', action: 'ui.library', label: 'Toggle library' },
  { key: 'KeyN', action: 'ui.layout', label: 'Toggle 2/4 decks' },
  { key: 'KeyM', action: 'ui.sampler', label: 'Toggle sampler' },
  { key: 'F1', action: 'sampler.1', label: 'Sampler pad 1' },
  { key: 'F2', action: 'sampler.2', label: 'Sampler pad 2' },
  { key: 'F3', action: 'sampler.3', label: 'Sampler pad 3' },
  { key: 'F4', action: 'sampler.4', label: 'Sampler pad 4' },
  { key: 'F5', action: 'sampler.5', label: 'Sampler pad 5' },
  { key: 'F6', action: 'sampler.6', label: 'Sampler pad 6' },
  { key: 'F7', action: 'sampler.7', label: 'Sampler pad 7' },
  { key: 'F8', action: 'sampler.8', label: 'Sampler pad 8' },
  { key: 'KeyB', action: 'record.toggle', label: 'Record', shift: true },
  { key: 'Digit1', action: 'deck.stems.vocals.mute', label: 'Mute vocals (focused deck)', shift: true },
  { key: 'Digit2', action: 'deck.stems.drums.mute', label: 'Mute drums (focused deck)', shift: true },
  { key: 'Digit3', action: 'deck.stems.bass.mute', label: 'Mute bass (focused deck)', shift: true },
  { key: 'Digit4', action: 'deck.stems.other.mute', label: 'Mute other (focused deck)', shift: true },
  { key: 'KeyP', action: 'deck.stems.panel', label: 'Stems panel (focused deck)', shift: true },
];

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

export function useKeyboardShortcuts() {
  useEffect(() => {
    const held = new Set<string>();
    const find = (e: KeyboardEvent) => DEFAULT_KEYMAP.find((b) => b.key === e.code && !!b.shift === e.shiftKey) ?? DEFAULT_KEYMAP.find((b) => b.key === e.code && !b.shift && !e.shiftKey);
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Slash' && e.shiftKey) {
        useUi.getState().setKeyboardHelpOpen(true);
        return;
      }
      if (e.code === 'Escape') {
        useUi.getState().setKeyboardHelpOpen(false);
        useUi.getState().setSettingsOpen(false);
        return;
      }
      const b = find(e);
      if (!b) return;
      e.preventDefault();
      if (held.has(e.code)) return; // ignore auto-repeat
      held.add(e.code);
      performAction(b.action, 1, { deck: b.deck });
    };
    const up = (e: KeyboardEvent) => {
      const b = DEFAULT_KEYMAP.find((x) => x.key === e.code);
      if (!held.has(e.code)) return;
      held.delete(e.code);
      if (b) performAction(b.action, 0, { deck: b.deck });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
}
