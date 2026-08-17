import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ListEnd, ListStart, Box, Plus, Trash2, Layers, ChevronRight, X } from 'lucide-react';
import type { TrackRef } from '@/services/tracks/TrackRef';
import { isStreamTrack } from '@/services/tracks/TrackRef';
import { useCrates } from '@/store/crates';
import { useLibrary } from '@/store/library';
import { useUi } from '@/store/ui';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { DECK_IDS, type DeckId } from '@/audio/engine/types';
import { deckColor } from '../deck/deckTheme';
import { tap } from '@/mobile/native';
import { cn } from '@/ui/cn';

export interface TrackMenuState {
  track: TrackRef;
  x: number;
  y: number;
  /** when shown from inside a crate: offer “remove from crate” */
  crateId?: string;
}

/**
 * Right-click / “⋯” menu for a library row: load to deck, queue, crates, stems.
 * Rendered in a portal at a fixed position; closes on outside click / Escape.
 */
export function TrackMenu({ state, onClose }: { state: TrackMenuState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [cratesOpen, setCratesOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const crates = useCrates((s) => s.crates);
  const enqueue = useCrates((s) => s.enqueue);
  const addToCrate = useCrates((s) => s.addToCrate);
  const removeFromCrate = useCrates((s) => s.removeFromCrate);
  const createCrate = useCrates((s) => s.createCrate);
  const layout = useUi((s) => s.layout);
  const setSource = useLibrary((s) => s.setSource);

  useLayoutEffect(() => {
    if (!state) return;
    setCratesOpen(false);
    setNewName('');
    const el = ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 260;
    setPos({ x: Math.min(state.x, window.innerWidth - w - 8), y: Math.min(state.y, window.innerHeight - h - 8) });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [state, onClose]);

  if (typeof document === 'undefined') return null;
  const t = state?.track;
  const item = 'flex h-8 w-full items-center gap-2 rounded px-2 text-left text-xs text-text hover:bg-white/[0.06] disabled:opacity-40';

  return createPortal(
    <AnimatePresence>
      {state && t && (
        <motion.div
          ref={ref}
          key={t.meta.id + state.x + state.y}
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          className="fixed z-[80] w-[230px] rounded-lg border border-border-2 bg-panel-2 p-1 shadow-2xl"
          style={{ left: pos.x, top: pos.y }}
          role="menu"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="truncate px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">{t.meta.title}</div>
          <div className="flex gap-1 px-1 pb-1">
            {DECK_IDS.slice(0, layout).map((id: DeckId) => (
              <button
                key={id}
                type="button"
                className="flex h-7 flex-1 items-center justify-center rounded border text-[11px] font-black"
                style={{ color: deckColor(id), borderColor: deckColor(id) + '66' }}
                onClick={() => {
                  tap();
                  void AudioEngine.deck(id).load(t);
                  onClose();
                }}
              >
                {id}
              </button>
            ))}
          </div>
          <button type="button" className={item} onClick={() => { enqueue([t]); toast.success('Added to queue'); onClose(); }}>
            <ListEnd size={13} className="text-text-dim" /> Add to queue
          </button>
          <button type="button" className={item} onClick={() => { enqueue([t], { next: true }); toast.success('Playing next'); onClose(); }}>
            <ListStart size={13} className="text-text-dim" /> Play next
          </button>
          <button type="button" className={cn(item, 'justify-between')} onClick={() => setCratesOpen((v) => !v)}>
            <span className="flex items-center gap-2">
              <Box size={13} className="text-text-dim" /> Add to crate
            </span>
            <ChevronRight size={12} className={cn('text-text-faint transition-transform', cratesOpen && 'rotate-90')} />
          </button>
          {cratesOpen && (
            <div className="mb-1 ml-3 rounded border border-border bg-bg-elev p-1">
              {crates.length === 0 && <div className="px-2 py-1 text-[11px] text-text-faint">No crates yet</div>}
              <div className="max-h-40 overflow-auto">
                {crates.map((c) => {
                  const has = c.trackIds.includes(t.meta.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={cn(item, 'h-7')}
                      disabled={has}
                      onClick={() => {
                        addToCrate(c.id, [t]);
                        toast.success(`Added to “${c.name}”`);
                        onClose();
                      }}
                    >
                      <Box size={12} className="text-text-faint" /> <span className="truncate">{c.name}</span>
                      {has && <span className="ml-auto text-[9px] uppercase text-text-faint">in crate</span>}
                    </button>
                  );
                })}
              </div>
              <form
                className="mt-1 flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newName.trim()) return;
                  createCrate(newName, [t]);
                  toast.success(`Crate “${newName.trim()}” created`);
                  setSource('crates');
                  onClose();
                }}
              >
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="New crate…"
                  className="h-7 min-w-0 flex-1 rounded border border-border bg-panel px-2 text-xs outline-none focus:border-accent"
                />
                <button type="submit" className="flex h-7 w-7 items-center justify-center rounded border border-border text-text-dim hover:text-text" aria-label="Create crate">
                  <Plus size={12} />
                </button>
              </form>
            </div>
          )}
          {state.crateId && (
            <button type="button" className={cn(item, 'text-danger')} onClick={() => { removeFromCrate(state.crateId!, t.meta.id); onClose(); }}>
              <Trash2 size={13} /> Remove from crate
            </button>
          )}
          {!isStreamTrack(t) && (
            <button
              type="button"
              className={item}
              onClick={() => {
                // prepare stems on whichever deck has it, else load into the focused deck first
                const dk = AudioEngine.decks.find((d) => d.snapshot.track?.meta.id === t.meta.id);
                if (dk) void dk.prepareStems();
                else {
                  const target = AudioEngine.deck(useUi.getState().focusedDeck);
                  void target.load(t).then(() => target.prepareStems());
                }
                onClose();
              }}
            >
              <Layers size={13} className="text-[#f472b6]" /> Prepare stems
            </button>
          )}
          <button type="button" className={cn(item, 'h-7 text-text-faint')} onClick={onClose}>
            <X size={12} /> Close
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
