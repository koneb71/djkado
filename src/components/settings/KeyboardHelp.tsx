import { Modal } from './Modal';
import { useUi } from '@/store/ui';
import { DEFAULT_KEYMAP } from '@/audio/keyboard/shortcuts';

const pretty = (code: string) => code.replace('Key', '').replace('Digit', '').replace('Arrow', '').replace('Space', 'Space');

export function KeyboardHelp() {
  const open = useUi((s) => s.keyboardHelpOpen);
  const setOpen = useUi((s) => s.setKeyboardHelpOpen);
  const groups = [
    { title: 'Deck A', items: DEFAULT_KEYMAP.filter((b) => b.deck === 'A') },
    { title: 'Deck B', items: DEFAULT_KEYMAP.filter((b) => b.deck === 'B') },
    { title: 'Global', items: DEFAULT_KEYMAP.filter((b) => !b.deck) },
  ];
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts" width={720}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-faint">{g.title}</div>
            <div className="flex flex-col gap-1">
              {g.items.map((b) => (
                <div key={b.key + b.action + (b.shift ? 's' : '')} className="flex items-center justify-between text-xs">
                  <span className="text-text-dim">{b.label}</span>
                  <kbd className="rounded border border-border bg-bg-elev px-1.5 py-0.5 font-mono text-[10px] text-text">
                    {b.shift ? '⇧ ' : ''}
                    {pretty(b.key)}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-[11px] text-text-faint">Tips: hold Shift while dragging a knob/fader for fine control · double-click resets · scroll over the waveform to zoom · drag on the waveform to scrub/scratch · right-click a hot cue to delete it.</div>
    </Modal>
  );
}
