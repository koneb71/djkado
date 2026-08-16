import { Headphones } from 'lucide-react';
import type { DeckId } from '@/audio/engine/types';
import { useMixer } from '@/store/mixer';
import { useUi } from '@/store/ui';
import { Knob } from '@/ui/Knob';
import { Fader } from '@/ui/Fader';
import { Button } from '@/ui/Button';
import { SectionLabel } from '@/ui/Panel';
import { Tooltip } from '@/ui/Tooltip';
import { VuMeter } from './VuMeter';
import { deckMeters } from '@/store/runtime';
import { deckColor } from '../deck/deckTheme';
import type { CrossfaderCurve } from '@/audio/engine/Crossfader';
import { cn } from '@/ui/cn';

function ChannelStripUI({ id, compact }: { id: DeckId; compact: boolean }) {
  const ch = useMixer((s) => s.channels[id]);
  const set = useMixer((s) => s.setChannel);
  const assign = useMixer((s) => s.assign[id]);
  const setAssign = useMixer((s) => s.setAssign);
  const color = deckColor(id);
  const knob = compact ? 30 : 38;
  const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${(v < 0 ? v * 26 : v * 12).toFixed(1)}dB`;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-[10px] font-black" style={{ color }}>
        {id}
      </div>
      <Knob size={knob} label="Gain" value={ch.gain} min={-1} max={1} defaultValue={0} bipolar color={color} onChange={(v) => set(id, { gain: v })} format={(v) => `${v > 0 ? '+' : ''}${(v * 12).toFixed(1)}dB`} />
      <Knob size={knob} label="Hi" value={ch.high} min={-1} max={1} defaultValue={0} bipolar color={color} onChange={(v) => set(id, { high: v })} format={fmtDb} />
      <Knob size={knob} label="Mid" value={ch.mid} min={-1} max={1} defaultValue={0} bipolar color={color} onChange={(v) => set(id, { mid: v })} format={fmtDb} />
      <Knob size={knob} label="Low" value={ch.low} min={-1} max={1} defaultValue={0} bipolar color={color} onChange={(v) => set(id, { low: v })} format={fmtDb} />
      <Knob size={knob} label="Filter" value={ch.filter} min={0} max={1} defaultValue={0.5} bipolar color={ch.filter < 0.5 ? '#f97316' : ch.filter > 0.5 ? '#60a5fa' : color} onChange={(v) => set(id, { filter: v })} format={(v) => (Math.abs(v - 0.5) < 0.01 ? 'OFF' : v < 0.5 ? `LP ${Math.round((1 - v * 2) * 100)}%` : `HP ${Math.round((v - 0.5) * 200)}%`)} />
      <Tooltip label="Headphone cue">
        <Button size="xs" square active={ch.cue} activeColor={color} onClick={() => set(id, { cue: !ch.cue })} aria-label="Cue">
          <Headphones size={11} />
        </Button>
      </Tooltip>
      <div className="flex items-end gap-1.5">
        <VuMeter channel={deckMeters[id]} width={6} height={compact ? 90 : 120} />
        <Fader value={ch.fader} min={0} max={1} defaultValue={1} onChange={(v) => set(id, { fader: v })} length={compact ? 90 : 120} thickness={30} color={color} ticks={5} />
      </div>
      <div className="flex gap-0.5">
        {(['A', 'thru', 'B'] as const).map((a) => (
          <button key={a} type="button" onClick={() => setAssign(id, a)} className={cn('h-4 rounded-sm px-1 text-[8px] font-bold uppercase', assign === a ? 'bg-panel-3 text-text' : 'text-text-faint hover:text-text-dim')}>
            {a === 'thru' ? '—' : a}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Mixer() {
  const layout = useUi((s) => s.layout);
  const xf = useMixer((s) => s.crossfader);
  const setXf = useMixer((s) => s.setCrossfader);
  const curve = useMixer((s) => s.curve);
  const setCurve = useMixer((s) => s.setCurve);
  const cueMix = useMixer((s) => s.cueMix);
  const setCueMix = useMixer((s) => s.setCueMix);
  const compact = layout === 4;
  const decks: DeckId[] = compact ? ['C', 'A', 'B', 'D'] : ['A', 'B'];
  return (
    <div className="panel noise flex h-full flex-col items-center gap-2 px-2 py-2.5">
      <SectionLabel>Mixer</SectionLabel>
      <div className={cn('flex flex-1 items-start', compact ? 'gap-2' : 'gap-4')}>
        {decks.map((id) => (
          <ChannelStripUI key={id} id={id} compact={compact} />
        ))}
      </div>
      <div className="flex w-full flex-col items-center gap-1.5 border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <Knob size={28} label="Cue mix" value={cueMix} min={0} max={1} defaultValue={0} onChange={setCueMix} color="var(--color-text)" format={(v) => (v < 0.5 ? `CUE ${Math.round((1 - v) * 100)}%` : `MIX ${Math.round(v * 100)}%`)} />
          <div className="flex gap-0.5">
            {(['linear', 'power', 'cut'] as CrossfaderCurve[]).map((c) => (
              <button key={c} type="button" onClick={() => setCurve(c)} className={cn('h-5 rounded px-1.5 text-[9px] font-semibold uppercase', curve === c ? 'bg-panel-3 text-text' : 'text-text-faint hover:text-text-dim')} title={`Crossfader curve: ${c}`}>
                {c === 'linear' ? 'Lin' : c === 'power' ? 'Pow' : 'Cut'}
              </button>
            ))}
          </div>
        </div>
        <Fader value={xf} min={-1} max={1} defaultValue={0} onChange={setXf} orientation="horizontal" length={compact ? 200 : 170} thickness={34} color="var(--color-text)" centerDetent ticks={7} />
        <div className="flex w-full justify-between px-1 text-[9px] font-bold text-text-faint">
          <span style={{ color: deckColor('A') }}>A</span>
          <span>Crossfader</span>
          <span style={{ color: deckColor('B') }}>B</span>
        </div>
      </div>
    </div>
  );
}
