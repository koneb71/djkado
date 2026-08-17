import { ACTION_LABELS, type ActionId } from '@/audio/midi/actions';
export { useMidiStore } from '@/audio/midi/MidiManager';

const HOTCUES: [ActionId, string][] = Array.from({ length: 8 }, (_, i) => [`deck.hotcue.${i + 1}` as ActionId, `Hot cue ${i + 1}`]);
const SAMPLER: [ActionId, string][] = Array.from({ length: 8 }, (_, i) => [`sampler.${i + 1}` as ActionId, `Sampler pad ${i + 1}`]);
const PADS: [ActionId, string][] = Array.from({ length: 8 }, (_, i) => [`deck.pad.${i + 1}` as ActionId, `Performance pad ${i + 1}`]);

export const ACTION_LABELS_LIST: [ActionId, string][] = [...(Object.entries(ACTION_LABELS) as [ActionId, string][]), ...HOTCUES, ...PADS, ...SAMPLER];
