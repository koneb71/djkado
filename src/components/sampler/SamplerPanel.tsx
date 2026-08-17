import { useRef } from 'react';
import { motion } from 'motion/react';
import { Upload, X, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { useSampler, PADS_PER_BANK, type PadMode } from '@/audio/engine/Sampler';
import { Knob } from '@/ui/Knob';
import { Button } from '@/ui/Button';
import { SectionLabel } from '@/ui/Panel';
import { useUi } from '@/store/ui';
import { cn } from '@/ui/cn';

const MODES: PadMode[] = ['oneshot', 'hold', 'loop'];

export function SamplerPanel({ mobile }: { mobile?: boolean } = {}) {
  const pads = useSampler((s) => s.pads);
  const bank = useSampler((s) => s.bank);
  const setBank = useSampler((s) => s.setBank);
  const volume = useSampler((s) => s.volume);
  const setVolume = useSampler((s) => s.setVolume);
  const update = useSampler((s) => s.update);
  const setSamplerOpen = useUi((s) => s.setSamplerOpen);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingPad = useRef<string | null>(null);

  const sampler = AudioEngine.sampler;

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={cn('panel noise flex gap-3 px-3 py-2', mobile ? 'flex-col' : 'mx-2 mb-2 items-center')}>
      <div className="flex flex-col items-center gap-1">
        <SectionLabel>Sampler</SectionLabel>
        <div className="flex gap-0.5">
          {[0, 1].map((b) => (
            <Button key={b} size="xs" active={bank === b} activeColor="var(--color-deck-c)" onClick={() => setBank(b)}>
              Bank {b + 1}
            </Button>
          ))}
        </div>
        <Knob size={30} value={volume} min={0} max={1} defaultValue={0.9} onChange={setVolume} color="var(--color-deck-c)" label="Vol" format={(v) => `${Math.round(v * 100)}%`} />
      </div>
      <div className={cn('grid flex-1 gap-1.5', mobile ? 'grid-cols-4' : 'grid-cols-8')}>
        {Array.from({ length: PADS_PER_BANK }).map((_, i) => {
          const id = `${bank}-${i}`;
          const p = pads[id];
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
          const target = pendingPad.current ?? `${bank}-${Object.values(pads).filter((p) => p.bank === bank).findIndex((p) => !p.hasSample)}`;
          if (target.endsWith('-1') && target.split('-')[1] === '-1') return toast.error('Bank is full');
          await sampler.loadFile(target, f);
          toast.success(`Loaded ${f.name}`);
        }}
      />
    </motion.div>
  );
}
