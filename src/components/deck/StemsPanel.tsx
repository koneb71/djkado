import { motion } from 'motion/react';
import { Cpu, Download, Loader2, Sparkles, Zap, AlertTriangle, RotateCcw } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { useDeck } from '@/store/decks';
import { useStems } from '@/store/stems';
import { STEM_ORDER, type StemName } from '@/audio/stems/models';
import { StemsQueue } from '@/audio/stems/StemsQueue';
import { Fader } from '@/ui/Fader';
import { Button } from '@/ui/Button';
import { deckColor } from './deckTheme';
import { cn } from '@/ui/cn';

const LABEL: Record<StemName, string> = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other' };
const STEM_COLOR: Record<StemName, string> = { vocals: '#f472b6', drums: '#f59e0b', bass: '#a78bfa', other: '#22c55e' };

const fmtMB = (b?: number) => (b ? `${(b / 1048576).toFixed(0)} MB` : '');
const fmtEta = (s?: number) => (s === undefined ? '' : s < 60 ? `~${Math.ceil(s)} s` : `~${Math.ceil(s / 60)} min`);

export function StemsPanel({ id }: { id: DeckId }) {
  const d = useDeck(id);
  const dk = AudioEngine.deck(id);
  const color = deckColor(id);
  const stems = useStems((s) => s.decks[id]);
  const trackId = d.track?.meta.id ?? '';
  const job = useStems((s) => (trackId ? s.jobs[trackId] : undefined));
  const webgpu = useStems((s) => s.webgpu);
  const busy = job && ['queued', 'downloading', 'loading', 'separating', 'encoding'].includes(job.state);
  const anySolo = Object.values(stems.solo).some(Boolean);

  const status = (() => {
    if (!d.track) return null;
    if (stems.available) return { text: `Stems ready · ${job?.engine === 'wasm' ? 'CPU' : 'WebGPU'}`, tone: 'ok' as const };
    if (!job || job.state === 'idle') return { text: 'Not prepared', tone: 'muted' as const };
    switch (job.state) {
      case 'queued': return { text: 'Queued…', tone: 'muted' as const };
      case 'downloading': return { text: `Downloading model ${Math.round(job.progress * 100)}% ${job.totalBytes ? `(${fmtMB(job.loadedBytes)} / ${fmtMB(job.totalBytes)})` : ''}`, tone: 'busy' as const };
      case 'loading': return { text: 'Loading model…', tone: 'busy' as const };
      case 'separating': return { text: `Separating ${Math.round(job.progress * 100)}% ${fmtEta(job.etaSec)} · ${job.engine === 'wasm' ? 'CPU' : 'WebGPU'}`, tone: 'busy' as const };
      case 'encoding': return { text: 'Finishing…', tone: 'busy' as const };
      case 'ready': return { text: 'Attaching…', tone: 'busy' as const };
      case 'error': return { text: job.error ?? 'Failed', tone: 'err' as const };
    }
  })();

  return (
    <div className="flex items-stretch gap-3">
      {/* status + prepare */}
      <div className="flex w-56 shrink-0 flex-col justify-between gap-2">
        <div className="text-[11px] leading-snug">
          {status && (
            <div className={cn('flex items-start gap-1.5', status.tone === 'ok' && 'text-success', status.tone === 'busy' && 'text-text', status.tone === 'err' && 'text-danger', status.tone === 'muted' && 'text-text-dim')}>
              {status.tone === 'busy' && <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin" />}
              {status.tone === 'ok' && <Sparkles size={12} className="mt-0.5 shrink-0" />}
              {status.tone === 'err' && <AlertTriangle size={12} className="mt-0.5 shrink-0" />}
              <span>{status.text}</span>
            </div>
          )}
          {busy && (
            <div className="mt-1.5 h-1 overflow-hidden rounded bg-white/10">
              <motion.div className="h-full" style={{ background: color }} animate={{ width: `${Math.round((job?.progress ?? 0) * 100)}%` }} transition={{ ease: 'linear', duration: 0.2 }} />
            </div>
          )}
          {!stems.available && !busy && d.track && (
            <div className="mt-1 text-[10px] text-text-faint">
              {webgpu === false ? (
                <span className="inline-flex items-center gap-1"><Cpu size={10} /> No WebGPU — CPU mode is slow (~5 min / track)</span>
              ) : (
                <span className="inline-flex items-center gap-1"><Zap size={10} /> WebGPU · ~30 s per track · 180 MB model on first use</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {!stems.available && !busy && (
            <Button size="sm" variant="primary" style={{ background: color, borderColor: color }} disabled={!d.track || !d.capabilities.stems} onClick={() => void dk.prepareStems('high')}>
              <Download size={12} /> Prepare stems
            </Button>
          )}
          {busy && (
            <Button size="sm" onClick={() => StemsQueue.cancel(trackId)}>
              Cancel
            </Button>
          )}
          {stems.available && (
            <Button size="sm" active={stems.active} activeColor={color} onClick={() => dk.setStemsActive(!stems.active)}>
              {stems.active ? 'Stems on' : 'Stems off'}
            </Button>
          )}
        </div>
      </div>

      {/* faders */}
      <div className="flex flex-1 items-end justify-around gap-2 border-l border-border pl-3">
        {STEM_ORDER.map((name) => {
          const muted = stems.mute[name] || (anySolo && !stems.solo[name]);
          const c = STEM_COLOR[name];
          return (
            <div key={name} className="flex flex-col items-center gap-1">
              <Fader value={stems.gains[name]} min={0} max={1} defaultValue={1} onChange={(v) => dk.setStemGain(name, v)} length={72} thickness={30} color={muted ? '#3a4250' : c} disabled={!stems.available} />
              <div className="flex gap-0.5">
                <button type="button" disabled={!stems.available} onClick={() => dk.toggleStemMute(name)} className={cn('h-5 w-5 rounded text-[9px] font-black', stems.mute[name] ? 'bg-danger/80 text-bg' : 'bg-panel-3 text-text-dim hover:text-text', !stems.available && 'opacity-40')}>
                  M
                </button>
                <button type="button" disabled={!stems.available} onClick={() => dk.toggleStemSolo(name)} className={cn('h-5 w-5 rounded text-[9px] font-black', stems.solo[name] ? 'text-bg' : 'bg-panel-3 text-text-dim hover:text-text', !stems.available && 'opacity-40')} style={stems.solo[name] ? { background: c } : undefined}>
                  S
                </button>
              </div>
              <span className="text-[9px] uppercase tracking-wider" style={{ color: muted ? '#5f6877' : c }}>
                {LABEL[name]}
              </span>
            </div>
          );
        })}
      </div>

      {/* presets */}
      <div className="flex shrink-0 flex-col justify-center gap-1 border-l border-border pl-3">
        {(
          [
            ['acapella', 'Acapella'],
            ['instrumental', 'Instrumental'],
            ['drumless', 'Drumless'],
            ['drums', 'Drums only'],
          ] as const
        ).map(([p, label]) => (
          <Button key={p} size="xs" disabled={!stems.available} onClick={() => dk.stemPreset(p)} className="justify-start">
            {label}
          </Button>
        ))}
        <Button size="xs" variant="ghost" disabled={!stems.available} onClick={() => dk.stemPreset('reset')}>
          <RotateCcw size={11} /> Reset
        </Button>
      </div>
    </div>
  );
}
