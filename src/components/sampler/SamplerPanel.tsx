import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Upload, X, Volume2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { useSampler, PADS_PER_BANK, MAX_BANKS, type PadMode } from '@/audio/engine/Sampler';
import { Knob } from '@/ui/Knob';
import { Button } from '@/ui/Button';
import { SectionLabel } from '@/ui/Panel';
import { useUi } from '@/store/ui';
import { cn } from '@/ui/cn';

const MODES: PadMode[] = ['oneshot', 'hold', 'loop'];

export function SamplerPanel({ mobile }: { mobile?: boolean } = {}) {
  const pads = useSampler((s) => s.pads);
  const banks = useSampler((s) => s.banks);
  const bank = useSampler((s) => s.bank);
  const setBank = useSampler((s) => s.setBank);
  const addBank = useSampler((s) => s.addBank);
  const renameBank = useSampler((s) => s.renameBank);
  const volume = useSampler((s) => s.volume);
  const setVolume = useSampler((s) => s.setVolume);
  const update = useSampler((s) => s.update);
  const setSamplerOpen = useUi((s) => s.setSamplerOpen);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingPad = useRef<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const cancelRename = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [bank, banks.length]);

  const sampler = AudioEngine.sampler;

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={cn('panel noise flex gap-3 px-3 py-2', mobile ? 'flex-col' : 'mx-2 mb-2 items-center')}>
      <div className={cn('flex flex-col gap-1', mobile ? 'items-stretch' : 'items-center')}>
        {!mobile && <SectionLabel>Sampler</SectionLabel>}
        {/* the bank list scrolls; add/delete stay pinned so they can't scroll out of reach */}
        <div className={cn('flex items-center gap-0.5', mobile ? 'w-full' : 'max-w-[210px]')}>
          <div ref={stripRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pb-0.5">
          <AnimatePresence initial={false}>
            {banks.map((b) => {
              const active = bank === b.id;
              const used = Object.values(pads).filter((p) => p.bank === b.id && p.hasSample).length;
              if (editing === b.id) {
                return (
                  <form
                    key={b.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameBank(b.id, draft);
                      setEditing(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => {
                        if (!cancelRename.current) renameBank(b.id, draft);
                        cancelRename.current = false;
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation(); // don't let the pad keymap swallow the keystrokes
                        if (e.key === 'Escape') {
                          cancelRename.current = true;
                          setEditing(null);
                        }
                      }}
                      className="h-6 w-20 rounded border border-accent bg-bg-elev px-1 text-[10px] text-text outline-none"
                    />
                  </form>
                );
              }
              return (
                <motion.div key={b.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex shrink-0 items-center">
                  <Button
                    size="xs"
                    data-active={active}
                    active={active}
                    activeColor="var(--color-deck-c)"
                    onClick={() => {
                      // touch has no double-click: tapping the bank you are already on renames it
                      if (mobile && active) {
                        setDraft(b.name);
                        setEditing(b.id);
                      } else setBank(b.id);
                    }}
                    onDoubleClick={() => {
                      setDraft(b.name);
                      setEditing(b.id);
                    }}
                    title={`${b.name} — ${used}/${PADS_PER_BANK} pads used (${mobile ? 'tap again' : 'double-click'} to rename)`}
                  >
                    {b.name}
                  </Button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          </div>
          <Button size="xs" variant="ghost" square className="shrink-0" disabled={banks.length >= MAX_BANKS} onClick={() => addBank()} title={banks.length >= MAX_BANKS ? `Maximum ${MAX_BANKS} banks` : 'Add a bank'} aria-label="Add bank">
            <Plus size={12} />
          </Button>
          {banks.length > 1 && (
            <Button
              size="xs"
              variant="ghost"
              square
              className="shrink-0"
              aria-label="Delete this bank"
              title={`Delete ${banks.find((b) => b.id === bank)?.name ?? 'bank'}`}
              onClick={() => {
                const b = banks.find((x) => x.id === bank);
                if (!b) return;
                const used = Object.values(pads).filter((p) => p.bank === bank && p.hasSample).length;
                if (used && !window.confirm(`Delete “${b.name}”? ${used} loaded sample${used === 1 ? '' : 's'} will be removed.`)) return;
                void sampler.removeBank(bank);
                toast.success(`Deleted “${b.name}”`);
              }}
            >
              <Trash2 size={11} />
            </Button>
          )}
        </div>
        <Knob size={30} value={volume} min={0} max={1} defaultValue={0.9} onChange={setVolume} color="var(--color-deck-c)" label="Vol" format={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <div className={cn('grid flex-1 gap-1.5', mobile ? 'grid-cols-4' : 'grid-cols-8')}>
        {Array.from({ length: PADS_PER_BANK }).map((_, i) => {
          const id = `${bank}-${i}`;
          const p = pads[id];
          if (!p) return null;
          return (
            <div key={id} className="flex flex-col gap-1">
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (!p.hasSample) {
                    pendingPad.current = id;
                    fileInput.current?.click();
                    return;
                  }
                  sampler.trigger(id);
                }}
                onPointerUp={() => sampler.release(id)}
                onPointerLeave={() => sampler.release(id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const f = e.dataTransfer.files[0];
                  if (f) {
                    await sampler.loadFile(id, f);
                    toast.success(`Loaded ${f.name} to pad ${i + 1}`);
                  }
                }}
                className={cn('relative flex flex-col items-start justify-between rounded-md border p-1.5 text-left outline-none', mobile ? 'h-20' : 'h-14', p.hasSample ? 'border-transparent' : 'border-dashed border-border text-text-faint hover:border-border-2')}
                style={p.hasSample ? { background: `linear-gradient(180deg, ${p.color}${p.playing ? 'ee' : '99'}, ${p.color}${p.playing ? 'bb' : '55'})`, boxShadow: p.playing ? `0 0 16px ${p.color}` : `inset 0 1px 0 rgba(255,255,255,0.2)`, color: '#0b0d10' } : undefined}
              >
                <span className="text-[10px] font-black">{i + 1}</span>
                <span className="w-full truncate text-[10px] font-semibold">{p.hasSample ? p.name : 'Click / drop'}</span>
                {p.hasSample && p.playing && <Volume2 size={10} className="absolute right-1 top-1" />}
              </motion.button>
              <div className="flex items-center justify-between gap-0.5">
                <select value={p.mode} onChange={(e) => update(id, { mode: e.target.value as PadMode })} className="h-4 flex-1 rounded border border-border bg-bg-elev px-0.5 text-[9px] text-text-dim">
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => sampler.clear(id)} className="text-text-faint hover:text-danger" aria-label="Clear pad" disabled={!p.hasSample}>
                  <X size={10} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-1">
        <Button
          size="xs"
          onClick={() => {
            pendingPad.current = null;
            fileInput.current?.click();
          }}
        >
          <Upload size={11} /> Load
        </Button>
        {!mobile && (
          <Button size="xs" variant="ghost" onClick={() => setSamplerOpen(false)}>
            Hide
          </Button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          let target = pendingPad.current;
          if (!target) {
            const free = Object.values(pads)
              .filter((p) => p.bank === bank)
              .sort((a, b) => a.index - b.index)
              .find((p) => !p.hasSample);
            if (!free) return toast.error('This bank is full — clear a pad or add a bank');
            target = free.id;
          }
          try {
            await sampler.loadFile(target, f);
            toast.success(`Loaded ${f.name}`);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not load that file');
          }
        }}
      />
    </motion.div>
  );
}
