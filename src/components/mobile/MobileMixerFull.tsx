import { useMixer } from '@/store/mixer';
import { Knob } from '@/ui/Knob';
import { Fader } from '@/ui/Fader';
import { VuMeter } from '../mixer/VuMeter';
import { deckMeters } from '@/store/runtime';
import { deckColor } from '../deck/deckTheme';
import type { DeckId } from '@/audio/engine/types';
import type { CrossfaderCurve } from '@/audio/engine/Crossfader';
import { cn } from '@/ui/cn';

/** Full 2-channel mixer for the Mix tab: gain / hi / mid / low / filter, faders, crossfader curve. */
export function MobileMixerFull() {
  const set = useMixer((s) => s.setChannel);
  const chans = useMixer((s) => s.channels);
  const curve = useMixer((s) => s.curve);
  const setCurve = useMixer((s) => s.setCurve);
  const master = useMixer((s) => s.master);
  const setMaster = useMixer((s) => s.setMaster);
  const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${(v < 0 ? v * 26 : v * 12).toFixed(1)}dB`;
  const strip = (id: DeckId) => {
    const ch = chans[id];
    const c = deckColor(id);
    return (
      <div key={id} className="panel flex flex-1 flex-col items-center gap-2 p-2">
        <div className="text-xs font-black" style={{ color: c }}>
          Deck {id}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Knob size={52} label="Gain" value={ch.gain} min={-1} max={1} defaultValue={0} bipolar color={c} onChange={(v) => set(id, { gain: v })} format={(v) => `${v > 0 ? '+' : ''}${(v * 12).toFixed(1)}dB`} />
          <Knob size={52} label="Hi" value={ch.high} min={-1} max={1} defaultValue={0} bipolar color={c} onChange={(v) => set(id, { high: v })} format={fmtDb} />
          <Knob size={52} label="Mid" value={ch.mid} min={-1} max={1} defaultValue={0} bipolar color={c} onChange={(v) => set(id, { mid: v })} format={fmtDb} />
          <Knob size={52} label="Low" value={ch.low} min={-1} max={1} defaultValue={0} bipolar color={c} onChange={(v) => set(id, { low: v })} format={fmtDb} />
        </div>
        <div className="flex items-end gap-2">
          <VuMeter channel={deckMeters[id]} width={6} height={110} />
          <Fader value={ch.fader} min={0} max={1} defaultValue={1} onChange={(v) => set(id, { fader: v })} length={110} thickness={40} color={c} ticks={5} label="Vol" />
          <Knob size={52} label="Filter" value={ch.filter} min={0} max={1} defaultValue={0.5} bipolar color={ch.filter < 0.5 ? '#f97316' : ch.filter > 0.5 ? '#60a5fa' : c} onChange={(v) => set(id, { filter: v })} format={(v) => (Math.abs(v - 0.5) < 0.01 ? 'OFF' : v < 0.5 ? 'LP' : 'HP')} />
        </div>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">{(['A', 'B'] as DeckId[]).map(strip)}</div>
      <div className="panel flex items-center justify-between gap-3 p-2">
        <Knob size={48} label="Master" value={master} min={0} max={1} defaultValue={0.85} onChange={setMaster} color="var(--color-text)" format={(v) => `${Math.round(v * 100)}%`} />
        <div className="flex flex-col items-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-text-faint">Crossfader curve</span>
          <div className="flex gap-1">
            {(['linear', 'power', 'cut'] as CrossfaderCurve[]).map((c) => (
              <button key={c} type="button" onClick={() => setCurve(c)} className={cn('h-8 rounded px-3 text-[11px] font-semibold uppercase', curve === c ? 'bg-panel-3 text-text' : 'text-text-faint')}>
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
