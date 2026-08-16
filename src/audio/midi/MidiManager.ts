import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { performAction, type ActionId } from './actions';
import type { DeckId } from '../engine/types';

export type MidiMsgType = 'note' | 'cc' | 'pitchbend';
export interface MidiMsg {
  type: MidiMsgType;
  channel: number; // 0..15
  number: number; // note or cc
  value: number; // 0..127 (pitchbend: 0..16383)
  device: string;
}

export type MappingMode = 'button' | 'toggle' | 'abs' | 'rel' | 'jog';

export interface MidiMapping {
  id: string;
  device?: string; // undefined = any
  type: MidiMsgType;
  channel: number;
  number: number;
  action: ActionId;
  deck?: DeckId;
  mode: MappingMode;
}

interface MidiState {
  supported: boolean;
  enabled: boolean;
  inputs: { id: string; name: string }[];
  mappings: MidiMapping[];
  learning: { action: ActionId; deck?: DeckId } | null;
  lastMessage: MidiMsg | null;
  activity: number;
  setEnabled: (b: boolean) => void;
  setInputs: (i: MidiState['inputs']) => void;
  addMapping: (m: MidiMapping) => void;
  removeMapping: (id: string) => void;
  clearMappings: () => void;
  startLearn: (action: ActionId, deck?: DeckId) => void;
  cancelLearn: () => void;
  setLast: (m: MidiMsg) => void;
}

export const useMidiStore = create<MidiState>()(
  persist(
    (set) => ({
      supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
      enabled: false,
      inputs: [],
      mappings: [],
      learning: null,
      lastMessage: null,
      activity: 0,
      setEnabled: (enabled) => set({ enabled }),
      setInputs: (inputs) => set({ inputs }),
      addMapping: (m) => set((s) => ({ mappings: [...s.mappings.filter((x) => !(x.type === m.type && x.channel === m.channel && x.number === m.number && x.device === m.device)), m] })),
      removeMapping: (id) => set((s) => ({ mappings: s.mappings.filter((m) => m.id !== id) })),
      clearMappings: () => set({ mappings: [] }),
      startLearn: (action, deck) => set({ learning: { action, deck } }),
      cancelLearn: () => set({ learning: null }),
      setLast: (m) => set((s) => ({ lastMessage: m, activity: s.activity + 1 })),
    }),
    { name: 'djkado.midi', partialize: (s) => ({ mappings: s.mappings, enabled: s.enabled }) },
  ),
);

export function parseMidi(data: Uint8Array, device: string): MidiMsg | null {
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (status === 0x90) return { type: 'note', channel, number: data[1], value: data[2], device };
  if (status === 0x80) return { type: 'note', channel, number: data[1], value: 0, device };
  if (status === 0xb0) return { type: 'cc', channel, number: data[1], value: data[2], device };
  if (status === 0xe0) return { type: 'pitchbend', channel, number: 0, value: data[1] | (data[2] << 7), device };
  return null;
}

/** Interpret relative-encoder CC values (two's complement / sign-magnitude / offset-64). */
export function relativeDelta(v: number): number {
  if (v === 0) return 0;
  if (v < 64) return v; // 1..63 = +
  return v - 128; // 65..127 = −
}

const CONTINUOUS: Set<string> = new Set(['deck.pitch', 'deck.jog', 'mixer.fader', 'mixer.gain', 'mixer.high', 'mixer.mid', 'mixer.low', 'mixer.filter', 'mixer.crossfader', 'mixer.master']);

class MidiManagerImpl {
  private access: any = null;
  private toggles = new Map<string, boolean>();

  async init() {
    const st = useMidiStore.getState();
    if (!st.supported || this.access) return;
    try {
      this.access = await (navigator as any).requestMIDIAccess({ sysex: false });
      this.refresh();
      this.access.onstatechange = () => this.refresh();
    } catch (e) {
      console.warn('MIDI access denied', e);
    }
  }

  private refresh() {
    if (!this.access) return;
    const inputs: { id: string; name: string }[] = [];
    for (const input of this.access.inputs.values()) {
      inputs.push({ id: input.id, name: input.name ?? input.id });
      input.onmidimessage = (e: any) => this.onMessage(e.data, input.name ?? input.id);
    }
    useMidiStore.getState().setInputs(inputs);
  }

  private onMessage(data: Uint8Array, device: string) {
    const msg = parseMidi(data, device);
    if (!msg) return;
    const st = useMidiStore.getState();
    st.setLast(msg);
    if (!st.enabled) return;
    if (st.learning) {
      // learn: notes → button, cc → abs (jog action → jog)
      const a = st.learning.action;
      const mode: MappingMode = a === 'deck.jog' ? 'jog' : msg.type === 'note' ? 'button' : CONTINUOUS.has(a) ? 'abs' : 'button';
      st.addMapping({ id: `${Date.now()}`, device, type: msg.type, channel: msg.channel, number: msg.number, action: a, deck: st.learning.deck, mode });
      st.cancelLearn();
      return;
    }
    for (const m of st.mappings) {
      if (m.type !== msg.type || m.channel !== msg.channel || m.number !== msg.number) continue;
      if (m.device && m.device !== device) continue;
      this.dispatch(m, msg);
    }
  }

  private dispatch(m: MidiMapping, msg: MidiMsg) {
    const max = msg.type === 'pitchbend' ? 16383 : 127;
    switch (m.mode) {
      case 'button':
        performAction(m.action, msg.value > 0 ? 1 : 0, { deck: m.deck });
        break;
      case 'toggle':
        if (msg.value > 0) {
          const k = m.id;
          const v = !this.toggles.get(k);
          this.toggles.set(k, v);
          performAction(m.action, v ? 1 : 0, { deck: m.deck });
        }
        break;
      case 'abs':
        performAction(m.action, msg.value / max, { deck: m.deck });
        break;
      case 'rel':
        performAction(m.action, 0.5 + relativeDelta(msg.value) / 127, { deck: m.deck, delta: relativeDelta(msg.value) });
        break;
      case 'jog':
        performAction('deck.jog', 0.5, { deck: m.deck, delta: relativeDelta(msg.value) });
        break;
    }
  }

  /** LED feedback: send note on/off to all outputs (generic). */
  sendFeedback(channel: number, note: number, on: boolean) {
    if (!this.access) return;
    for (const out of this.access.outputs.values()) {
      try {
        out.send([0x90 | channel, note, on ? 127 : 0]);
      } catch {
        /* noop */
      }
    }
  }
}

export const MidiManager = new MidiManagerImpl();

export function useMidi() {
  const enabled = useMidiStore((s) => s.enabled);
  useEffect(() => {
    if (enabled) MidiManager.init();
  }, [enabled]);
}
