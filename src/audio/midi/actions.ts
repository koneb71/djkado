import { AudioEngine } from '../engine/AudioEngine';
import type { DeckId } from '../engine/types';
import { useMixer } from '@/store/mixer';
import { useUi } from '@/store/ui';
import { useLibrary } from '@/store/library';
import { useSampler } from '../engine/Sampler';
import { useStems } from '@/store/stems';
import { useCrates } from '@/store/crates';
import { useAutomix } from '@/store/automix';
import { Automix } from '../engine/Automix';
import { ROLL_SIZES, JUMP_SIZES } from '@/components/deck/padSizes';
import { findTrack } from '@/services/tracks/registry';
import type { TrackRef } from '@/services/tracks/TrackRef';

/**
 * Central action registry. Both keyboard shortcuts and MIDI mappings dispatch through here so
 * behaviour stays consistent. `value` is 0..1 for continuous controls, 1/0 for press/release.
 */
export type ActionId =
  | 'deck.play' | 'deck.cue' | 'deck.cuePlay' | 'deck.sync' | 'deck.keylock' | 'deck.slip' | 'deck.quantize'
  | 'deck.hotcue.1' | 'deck.hotcue.2' | 'deck.hotcue.3' | 'deck.hotcue.4' | 'deck.hotcue.5' | 'deck.hotcue.6' | 'deck.hotcue.7' | 'deck.hotcue.8'
  | 'deck.loop.toggle' | 'deck.loop.halve' | 'deck.loop.double' | 'deck.loop.in' | 'deck.loop.out' | 'deck.beatjump.back' | 'deck.beatjump.fwd'
  | 'deck.pitch' | 'deck.pitch.up' | 'deck.pitch.down' | 'deck.bend.up' | 'deck.bend.down' | 'deck.jog' | 'deck.jogTouch' | 'deck.brake' | 'deck.backspin' | 'deck.censor' | 'deck.reverse'
  | 'deck.load' | 'deck.eject' | 'deck.fx.toggle'
  | 'mixer.fader' | 'mixer.gain' | 'mixer.high' | 'mixer.mid' | 'mixer.low' | 'mixer.filter' | 'mixer.cue' | 'mixer.crossfader' | 'mixer.master'
  | 'browser.up' | 'browser.down' | 'browser.loadFocused'
  | 'sampler.1' | 'sampler.2' | 'sampler.3' | 'sampler.4' | 'sampler.5' | 'sampler.6' | 'sampler.7' | 'sampler.8'
  | 'sampler.bank.next' | 'sampler.bank.prev'
  | 'ui.layout' | 'ui.sampler' | 'ui.library' | 'record.toggle'
  | 'browser.queue' | 'browser.queueNext' | 'automix.toggle' | 'automix.skip'
  | 'deck.stems.toggle' | 'deck.stems.prepare' | 'deck.stems.panel'
  | 'deck.stems.vocals.mute' | 'deck.stems.drums.mute' | 'deck.stems.bass.mute' | 'deck.stems.other.mute'
  | 'deck.stems.vocals.solo' | 'deck.stems.drums.solo' | 'deck.stems.bass.solo' | 'deck.stems.other.solo'
  | 'deck.stems.vocals.level' | 'deck.stems.drums.level' | 'deck.stems.bass.level' | 'deck.stems.other.level'
  | 'deck.pad.1' | 'deck.pad.2' | 'deck.pad.3' | 'deck.pad.4' | 'deck.pad.5' | 'deck.pad.6' | 'deck.pad.7' | 'deck.pad.8'
  | 'deck.padMode.hotcue' | 'deck.padMode.roll' | 'deck.padMode.slicer' | 'deck.padMode.beatjump' | 'deck.padMode.next';

export const ACTION_LABELS: Partial<Record<ActionId, string>> = {
  'deck.play': 'Play / Pause', 'deck.cue': 'Cue', 'deck.cuePlay': 'Cue + Play', 'deck.sync': 'Sync', 'deck.keylock': 'Key lock', 'deck.slip': 'Slip', 'deck.quantize': 'Quantize',
  'deck.loop.toggle': 'Loop on/off', 'deck.loop.halve': 'Loop ½', 'deck.loop.double': 'Loop ×2', 'deck.loop.in': 'Loop in', 'deck.loop.out': 'Loop out',
  'deck.beatjump.back': 'Beat jump ←', 'deck.beatjump.fwd': 'Beat jump →', 'deck.pitch': 'Pitch fader', 'deck.pitch.up': 'Pitch +', 'deck.pitch.down': 'Pitch −', 'deck.bend.up': 'Bend +', 'deck.bend.down': 'Bend −',
  'deck.jog': 'Jog wheel', 'deck.jogTouch': 'Jog touch', 'deck.brake': 'Brake', 'deck.backspin': 'Backspin', 'deck.censor': 'Censor', 'deck.reverse': 'Reverse', 'deck.load': 'Load selected', 'deck.eject': 'Eject', 'deck.fx.toggle': 'FX panel',
  'mixer.fader': 'Channel fader', 'mixer.gain': 'Gain', 'mixer.high': 'EQ high', 'mixer.mid': 'EQ mid', 'mixer.low': 'EQ low', 'mixer.filter': 'Filter', 'mixer.cue': 'Headphone cue', 'mixer.crossfader': 'Crossfader', 'mixer.master': 'Master volume',
  'deck.stems.toggle': 'Stems on/off', 'deck.stems.prepare': 'Prepare stems', 'deck.stems.panel': 'Stems panel',
  'deck.stems.vocals.mute': 'Mute vocals', 'deck.stems.drums.mute': 'Mute drums', 'deck.stems.bass.mute': 'Mute bass', 'deck.stems.other.mute': 'Mute other',
  'deck.stems.vocals.solo': 'Solo vocals', 'deck.stems.drums.solo': 'Solo drums', 'deck.stems.bass.solo': 'Solo bass', 'deck.stems.other.solo': 'Solo other',
  'deck.stems.vocals.level': 'Vocals level', 'deck.stems.drums.level': 'Drums level', 'deck.stems.bass.level': 'Bass level', 'deck.stems.other.level': 'Other level',
  'deck.padMode.hotcue': 'Pads: hot cue', 'deck.padMode.roll': 'Pads: roll', 'deck.padMode.slicer': 'Pads: slicer', 'deck.padMode.beatjump': 'Pads: beat jump', 'deck.padMode.next': 'Pads: next mode',
  'browser.up': 'Browse up', 'browser.down': 'Browse down', 'browser.loadFocused': 'Load to focused deck', 'ui.layout': 'Toggle 2/4 decks', 'ui.sampler': 'Toggle sampler', 'ui.library': 'Toggle library', 'record.toggle': 'Record',
  'sampler.bank.next': 'Sampler bank +', 'sampler.bank.prev': 'Sampler bank −',
  'browser.queue': 'Add selected to queue', 'browser.queueNext': 'Play selected next', 'automix.toggle': 'Auto DJ on/off', 'automix.skip': 'Auto DJ: skip / mix now',
};

export interface ActionContext {
  deck?: DeckId;
  /** relative encoder delta (jog) in ticks */
  delta?: number;
}

const HOTCUE_RE = /^deck\.hotcue\.(\d)$/;
const STEM_RE = /^deck\.stems\.(vocals|drums|bass|other)\.(mute|solo|level)$/;
const SAMPLER_RE = /^sampler\.(\d)$/;
const PAD_RE = /^deck\.pad\.(\d)$/;
const PADMODE_RE = /^deck\.padMode\.(hotcue|roll|slicer|beatjump|next)$/;

export function performAction(action: ActionId, value: number, ctx: ActionContext = {}) {
  const deckId = ctx.deck ?? useUi.getState().focusedDeck;
  const dk = AudioEngine.deck(deckId);
  const mixer = useMixer.getState();
  const pressed = value > 0.5;

  const hc = HOTCUE_RE.exec(action);
  if (hc) {
    const i = Number(hc[1]) - 1;
    if (pressed) dk.hotCuePress(i);
    else dk.hotCueRelease(i);
    return;
  }
  const pad = PAD_RE.exec(action);
  if (pad) {
    const i = Number(pad[1]) - 1;
    const mode = useUi.getState().padMode[deckId];
    if (mode === 'hotcue') {
      if (pressed) dk.hotCuePress(i);
      else dk.hotCueRelease(i);
    } else if (mode === 'roll') dk.loopRoll(ROLL_SIZES[i], pressed);
    else if (mode === 'slicer') dk.sliceHold(i, pressed);
    else if (pressed) dk.beatJump(JUMP_SIZES[i]);
    return;
  }
  const pm = PADMODE_RE.exec(action);
  if (pm) {
    if (!pressed) return;
    const modes = ['hotcue', 'roll', 'slicer', 'beatjump'] as const;
    const cur = useUi.getState().padMode[deckId];
    const next = pm[1] === 'next' ? modes[(modes.indexOf(cur) + 1) % modes.length] : (pm[1] as (typeof modes)[number]);
    useUi.getState().setPadMode(deckId, next);
    return;
  }
  const sm = STEM_RE.exec(action);
  if (sm) {
    const name = sm[1] as 'vocals' | 'drums' | 'bass' | 'other';
    if (sm[2] === 'level') dk.setStemGain(name, value);
    else if (pressed) {
      if (sm[2] === 'mute') dk.toggleStemMute(name);
      else dk.toggleStemSolo(name);
    }
    return;
  }
  if (action === 'sampler.bank.next' || action === 'sampler.bank.prev') {
    if (pressed) {
      const { banks, bank, setBank } = useSampler.getState();
      const i = Math.max(0, banks.findIndex((b) => b.id === bank));
      const next = banks[(i + (action === 'sampler.bank.next' ? 1 : banks.length - 1)) % banks.length];
      if (next) setBank(next.id);
    }
    return;
  }
  const sp = SAMPLER_RE.exec(action);
  if (sp) {
    const bank = useSampler.getState().bank;
    const id = `${bank}-${Number(sp[1]) - 1}`;
    if (pressed) AudioEngine.sampler.trigger(id);
    else AudioEngine.sampler.release(id);
    return;
  }

  switch (action) {
    case 'deck.play': if (pressed) dk.togglePlay(); break;
    case 'deck.cue': if (pressed) dk.cuePress(); else dk.cueRelease(); break;
    case 'deck.cuePlay': if (pressed) dk.cuePlay(); break;
    case 'deck.sync': if (pressed) AudioEngine.toggleSync(deckId); break;
    case 'deck.keylock': if (pressed) dk.setKeylock(!dk.snapshot.keylock); break;
    case 'deck.slip': if (pressed) dk.setSlip(!dk.snapshot.slip); break;
    case 'deck.quantize': if (pressed) dk.setQuantize(!dk.snapshot.quantize); break;
    case 'deck.loop.toggle': if (pressed) dk.toggleLoop(); break;
    case 'deck.loop.halve': if (pressed) dk.loopHalve(); break;
    case 'deck.loop.double': if (pressed) dk.loopDouble(); break;
    case 'deck.loop.in': if (pressed) dk.loopIn(); break;
    case 'deck.loop.out': if (pressed) dk.loopOut(); break;
    case 'deck.beatjump.back': if (pressed) dk.beatJump(-dk.snapshot.autoLoopBeats); break;
    case 'deck.beatjump.fwd': if (pressed) dk.beatJump(dk.snapshot.autoLoopBeats); break;
    case 'deck.pitch': dk.setPitch(-(value * 2 - 1)); break; // hardware: top = slower
    case 'deck.pitch.up': if (pressed) dk.setPitch(dk.snapshot.pitch + 0.02); break;
    case 'deck.pitch.down': if (pressed) dk.setPitch(dk.snapshot.pitch - 0.02); break;
    case 'deck.bend.up': if (pressed) dk.bend(1, 300); break;
    case 'deck.bend.down': if (pressed) dk.bend(-1, 300); break;
    case 'deck.jog': {
      const d = ctx.delta ?? 0;
      if (dk.snapshot.playing || (dk as any).scratching) dk.jogScratch(d * 0.55); // ticks → rev/s approx
      else dk.scrub(d * 0.02);
      break;
    }
    case 'deck.jogTouch': dk.jogTouch(pressed); break;
    case 'deck.brake': if (pressed) dk.brake(); break;
    case 'deck.backspin': if (pressed) dk.backspin(); break;
    case 'deck.censor': dk.censor(pressed); break;
    case 'deck.reverse': if (pressed) dk.setReverse(!(dk as any).reversed); break;
    case 'deck.load': if (pressed) loadSelected(deckId); break;
    case 'deck.eject': if (pressed) dk.eject(); break;
    case 'deck.fx.toggle': if (pressed) useUi.getState().toggleFx(deckId); break;
    case 'mixer.fader': mixer.setChannel(deckId, { fader: value }); break;
    case 'mixer.gain': mixer.setChannel(deckId, { gain: value * 2 - 1 }); break;
    case 'mixer.high': mixer.setChannel(deckId, { high: value * 2 - 1 }); break;
    case 'mixer.mid': mixer.setChannel(deckId, { mid: value * 2 - 1 }); break;
    case 'mixer.low': mixer.setChannel(deckId, { low: value * 2 - 1 }); break;
    case 'mixer.filter': mixer.setChannel(deckId, { filter: value }); break;
    case 'mixer.cue': if (pressed) mixer.setChannel(deckId, { cue: !mixer.channels[deckId].cue }); break;
    case 'mixer.crossfader': mixer.setCrossfader(value * 2 - 1); break;
    case 'mixer.master': mixer.setMaster(value); break;
    case 'browser.up': if (pressed) moveSelection(-1); break;
    case 'browser.down': if (pressed) moveSelection(1); break;
    case 'browser.loadFocused': if (pressed) loadSelected(deckId); break;
    case 'ui.layout': if (pressed) useUi.getState().setLayout(useUi.getState().layout === 2 ? 4 : 2); break;
    case 'ui.sampler': if (pressed) useUi.getState().setSamplerOpen(!useUi.getState().samplerOpen); break;
    case 'ui.library': if (pressed) useUi.getState().setLibraryOpen(!useUi.getState().libraryOpen); break;
    case 'record.toggle': if (pressed) AudioEngine.recorder.toggle(); break;
    case 'browser.queue': if (pressed) queueSelected(false); break;
    case 'browser.queueNext': if (pressed) queueSelected(true); break;
    case 'automix.toggle': if (pressed) useAutomix.getState().setEnabled(!useAutomix.getState().enabled); break;
    case 'automix.skip': if (pressed) Automix.skip(); break;
    case 'deck.stems.toggle': if (pressed) dk.setStemsActive(!useStems.getState().decks[deckId].active); break;
    case 'deck.stems.prepare': if (pressed) void dk.prepareStems('high'); break;
    case 'deck.stems.panel': if (pressed) useUi.getState().toggleStems(deckId); break;
  }
}

function currentList() {
  const s = useLibrary.getState();
  if (s.source === 'local') return s.localTracks;
  if (s.source === 'crates') {
    const c = useCrates.getState();
    const crate = c.crates.find((x) => x.id === c.selectedCrateId) ?? c.crates[0];
    return crate ? crate.trackIds.map((id) => findTrack(id)).filter((t): t is TrackRef => !!t) : [];
  }
  if (s.source === 'queue') return [];
  const key = `${s.source}:${s.search.trim() || s.selectedPlaylist[s.source]}`;
  return s.playlistTracks[key] ?? [];
}

function moveSelection(dir: number) {
  const s = useLibrary.getState();
  const list = currentList();
  if (!list.length) return;
  const idx = list.findIndex((t) => t.meta.id === s.selectedTrackId);
  const next = list[Math.max(0, Math.min(list.length - 1, idx + dir))];
  s.select(next.meta.id);
}

function queueSelected(next: boolean) {
  const s = useLibrary.getState();
  const t = currentList().find((x) => x.meta.id === s.selectedTrackId);
  if (t) useCrates.getState().enqueue([t], { next });
}

function loadSelected(deck: DeckId) {
  const s = useLibrary.getState();
  const t = currentList().find((x) => x.meta.id === s.selectedTrackId);
  if (t) AudioEngine.deck(deck).load(t);
}
