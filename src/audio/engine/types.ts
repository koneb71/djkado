import type { BeatGrid } from '../dsp/beatgrid';
import type { WaveformData } from '../dsp/waveform';
import type { TrackRef } from '@/services/tracks/TrackRef';

export type DeckId = 'A' | 'B' | 'C' | 'D';
export const DECK_IDS: DeckId[] = ['A', 'B', 'C', 'D'];

export interface AnalysisResult {
  duration: number;
  bpm: number;
  bpmConfidence: number;
  firstBeatSec: number;
  key: { camelot: string; name: string; confidence: number };
  waveform: WaveformData;
  gainDb: number;
}

export interface LoadedTrackInfo {
  duration: number;
  sampleRate?: number;
  analysis?: AnalysisResult | null;
}

export interface HotCue {
  index: number; // 0..7
  sec: number;
  color: string;
  name?: string;
  type: 'cue' | 'loop';
  loopEnd?: number;
}

export interface LoopInfo {
  enabled: boolean;
  start: number;
  end: number;
  beats?: number; // auto-loop length in beats if applicable
}

export interface DeckSnapshot {
  id: DeckId;
  track: TrackRef | null;
  loading: boolean;
  analyzing: boolean;
  analysisProgress: number;
  duration: number;
  playing: boolean;
  bpm: number; // original
  key: string; // camelot
  keyName: string;
  grid: BeatGrid | null;
  pitch: number; // -1..1 within range
  pitchRange: number; // 0.08, 0.16, 0.5
  rate: number; // effective playback rate (1 = normal)
  keylock: boolean;
  keyShift: number; // semitones
  slip: boolean;
  quantize: boolean;
  sync: boolean;
  isMaster: boolean;
  loop: LoopInfo;
  autoLoopBeats: number;
  hotCues: (HotCue | null)[];
  cuePoint: number;
  gainDb: number; // auto-gain
  waveform: WaveformData | null;
  capabilities: DeckCapabilities;
  error: string | null;
}

export interface DeckCapabilities {
  tempo: boolean;
  scratch: boolean;
  eq: boolean;
  fx: boolean;
  loops: boolean;
  hotCues: boolean;
  waveform: boolean;
  sync: boolean;
  keylock: boolean;
  reverse: boolean;
}

export const FULL_CAPS: DeckCapabilities = {
  tempo: true,
  scratch: true,
  eq: true,
  fx: true,
  loops: true,
  hotCues: true,
  waveform: true,
  sync: true,
  keylock: true,
  reverse: true,
};

export const STREAM_CAPS: DeckCapabilities = {
  tempo: false,
  scratch: false,
  eq: false,
  fx: false,
  loops: false,
  hotCues: true, // seek-based cues are still fine
  waveform: false,
  sync: false,
  keylock: false,
  reverse: false,
};

export const HOT_CUE_COLORS = ['#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899', '#ef4444'];
