import { toast } from 'sonner';
import { AudioEngine } from '@/audio/engine/AudioEngine';
import { DECK_IDS } from '@/audio/engine/types';
import { restoreFx } from '@/audio/fx/restoreFx';
import { LocalLibrary } from '@/services/localLibrary/LocalLibrary';
import { storedStemIds } from '@/services/localLibrary/db';
import { useDecks } from '@/store/decks';
import { useDeckPrefs } from '@/store/deckPrefs';
import { useStems } from '@/store/stems';

let started = false;
let engineRestored = false;

/**
 * Bring the previous session back.
 *
 * Restored: the local library (Android SAF grants / File System Access folders), the FX rack,
 * per-deck switches (keylock, quantize, slip, auto-loop size, pitch range), and everything the
 * stores already persisted (mixer trim/master/curve, crates, queue, MIDI map, hot cues per track).
 *
 * Deliberately NOT restored: loaded tracks, play/sync state, channel faders, EQ, filter and the
 * crossfader — a fader left at 0 or a killed EQ would look like "the app is broken, no sound".
 */
export async function restoreSession() {
  if (started) return;
  started = true;

  // stems: the persisted "ready" flags can outlive LRU-evicted blobs — reconcile before the UI lies
  void storedStemIds().then((ids) => {
    const ready = useStems.getState().ready;
    const live = new Set(ids);
    for (const id of Object.keys(ready)) if (ready[id] && !live.has(id)) useStems.getState().markReady(id, false);
  });

  try {
    const { tracks } = await LocalLibrary.restore();
    if (tracks > 0) toast.success(`Library restored — ${tracks} track${tracks === 1 ? '' : 's'}`, { duration: 2000 });
    // tracks that can't be re-opened are surfaced in Settings ▸ Library, not as a toast on every launch
  } catch (e) {
    console.warn('[session] library restore failed', e);
  }
}

/** Engine-side restore — needs a live AudioContext, so it runs on the first user gesture. */
export function restoreEngineState() {
  if (engineRestored) return;
  engineRestored = true;
  try {
    restoreFx();
  } catch (e) {
    console.warn('[session] fx restore failed', e);
  }
  const prefs = useDeckPrefs.getState().decks;
  for (const id of DECK_IDS) {
    const p = prefs[id];
    if (!p) continue;
    const dk = AudioEngine.deck(id);
    if (p.keylock) dk.setKeylock(true);
    if (!p.quantize) dk.setQuantize(false);
    if (p.slip) dk.setSlip(true);
    if (p.autoLoopBeats && p.autoLoopBeats !== 4) dk.setAutoLoopBeats(p.autoLoopBeats);
  }
  // mirror future changes back into the persisted prefs
  useDecks.subscribe((s) => {
    const cur = useDeckPrefs.getState().decks;
    for (const id of DECK_IDS) {
      const d = s.decks[id];
      const c = cur[id];
      // an ejected deck is reset to defaults — don't let that erase the user's switches
      if (!d || !c || !d.track) continue;
      if (d.keylock !== c.keylock || d.quantize !== c.quantize || d.slip !== c.slip || d.autoLoopBeats !== c.autoLoopBeats) {
        useDeckPrefs.getState().set(id, { keylock: d.keylock, quantize: d.quantize, slip: d.slip, autoLoopBeats: d.autoLoopBeats });
      }
    }
  });
}
