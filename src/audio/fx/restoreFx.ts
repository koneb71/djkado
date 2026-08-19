import { AudioEngine } from '../engine/AudioEngine';
import { DECK_IDS } from '../engine/types';
import { useFx } from '@/store/fx';
import { FX_KINDS } from './FxUnit';

/**
 * Replay the persisted FX rack into the audio graph.
 * Mirrors what FxPanel does when a slot is chosen: setSlot → setMix → setEnabled → setParam*.
 * Must run after the AudioContext exists (i.e. after the first user gesture).
 */
export function restoreFx() {
  const { decks } = useFx.getState();
  for (const id of DECK_IDS) {
    const slots = decks[id];
    if (!slots) continue;
    const chain = AudioEngine.deck(id).strip.fx;
    slots.forEach((slot, i) => {
      // a kind saved by an older build may no longer exist — skip it instead of leaving a hole
      if (!slot.kind || !FX_KINDS.some((k) => k.kind === slot.kind)) return;
      const unit = chain.setSlot(i, slot.kind);
      if (!unit) return;
      unit.setMix(slot.mix);
      const params: Record<string, number> = {};
      for (const spec of unit.params) {
        const saved = slot.params?.[spec.name];
        if (saved !== undefined) unit.setParam(spec.name, saved);
        // setParam clamps to the current spec, so read back what the unit actually took —
        // otherwise a spec change between versions leaves the knobs showing stale values
        params[spec.name] = unit.value(spec.name) ?? spec.default;
      }
      unit.setEnabled(slot.enabled);
      useFx.getState().setSlot(id, i, { params });
    });
  }
}
