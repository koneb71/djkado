import { useMixer } from '@/store/mixer';
import { Fader } from '@/ui/Fader';
import { Knob } from '@/ui/Knob';
import { VuMeter } from '../mixer/VuMeter';
import { deckMeters } from '@/store/runtime';
import { deckColor } from '../deck/deckTheme';
import type { DeckId } from '@/audio/engine/types';

/** Slim mixer strip between the two mobile decks: volume + filter per deck and the crossfader. */
export function MobileMiniMixer({ vertical }: { vertical?: boolean }) {
  const chA = useMixer((s) => s.channels.A);
  const chB = useMixer((s) => s.channels.B);
  const set = useMixer((s) => s.setChannel);
  const xf = useMixer((s) => s.crossfader);
  const setXf = useMixer((s) => s.setCrossfader);
  const fmtFilter = (v: number) => (Math.abs(v - 0.5) < 0.01 ? 'OFF' : v < 0.5 ? `LP ${Math.round((1 - v * 2) * 100)}%` : `HP ${Math.round((v - 0.5) * 200)}%`);

  const side = (id: DeckId, ch: typeof chA) => (
    <div className="flex items-end gap-1.5">
      <VuMeter channel={deckMeters[id]} width={5} height={vertical ? 70 : 60} />
      <Fader value={ch.fader} min={0} max={1} defaultValue={1} onChange={(v) => set(id, { fader: v })} length={vertical ? 70 : 60} thickness={40} color={deckColor(id)} ticks={3} />
      <Knob size={40} value={ch.filter} min={0} max={1} defaultValue={0.5} bipolar color={ch.filter < 0.5 ? '#f97316' : ch.filter > 0.5 ? '#60a5fa' : deckColor(id)} onChange={(v) => set(id, { filter: v })} format={fmtFilter} label="Filter" />
    </div>
  );

  if (vertical) {
    return (
      <div className="panel flex w-[132px] shrink-0 flex-col items-center justify-between gap-2 px-1.5 py-2">
        {side('A', chA)}
        <Fader value={xf} min={-1} max={1} defaultValue={0} onChange={setXf} orientation="horizontal" length={110} thickness={40} color="var(--color-text)" centerDetent ticks={3} />
        {side('B', chB)}
      </div>
    );
  }
  return (
    <div className="panel flex shrink-0 items-center justify-between gap-2 px-2 py-1.5">
      {side('A', chA)}
      <div className="flex flex-col items-center">
        <Fader value={xf} min={-1} max={1} defaultValue={0} onChange={setXf} orientation="horizontal" length={140} thickness={44} color="var(--color-text)" centerDetent ticks={5} />
        <div className="flex w-full justify-between px-1 text-[9px] font-bold text-text-faint">
          <span style={{ color: deckColor('A') }}>A</span>
          <span style={{ color: deckColor('B') }}>B</span>
        </div>
      </div>
      {side('B', chB)}
    </div>
  );
}
