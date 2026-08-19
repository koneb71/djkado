import type { TrackRef } from '@/services/tracks/TrackRef';
import type { DeckCapabilities, LoadedTrackInfo } from '../engine/types';

export type BackendEvent =
  | { type: 'state'; playing: boolean }
  | { type: 'position'; seconds: number; ctxTime: number; rate: number; playing: boolean; slipSeconds: number }
  | { type: 'ended' }
  | { type: 'loopWrap' }
  | { type: 'error'; error: Error };

export interface DeckBackend {
  readonly kind: 'webaudio' | 'spotify' | 'apple' | 'mock-stream';
  readonly capabilities: DeckCapabilities;
  /** Only WebAudio backends expose an output node that feeds the ChannelStrip. */
  readonly output?: AudioNode;
  readonly duration: number;

  load(track: TrackRef, opts?: { signal?: AbortSignal; onProgress?: (p: number, stage: string) => void }): Promise<LoadedTrackInfo>;
  unload(): void;
  play(): Promise<void> | void;
  pause(): Promise<void> | void;
  seek(seconds: number): void;
  /** Schedule a sample-accurate seek at a context time (WebAudio only; others seek immediately). */
  seekAt(seconds: number, ctxTime: number): void;
  setRate(rate: number): void;
  setNominalRate(rate: number): void;
  setVolume(v01: number): void;
  setLoop(enabled: boolean, startSec?: number, endSec?: number): void;
  setSlip(enabled: boolean): void;
  slipReturn(): void;
  scratch(on: boolean): void;
  /** Ramp the rate AudioParam (WebAudio). Others: no-op. */
  rampRate(target: number, timeConstant: number): void;
  /** ramp starting from an explicit value (rampRate alone cancels a same-instant setValueAtTime) */
  rampRateFrom?(from: number, target: number, timeConstant: number): void;
  /** while the motor ramps (platter spin up/down) key lock must not hold the pitch */
  setMotorRamp?(on: boolean): void;
  setRateAt(rate: number, ctxTime?: number): void;
  getPosition(): number;
  isPlaying(): boolean;
  subscribe(cb: (e: BackendEvent) => void): () => void;
  /** Stems (WebAudio only): attach Int16 stems (vocals, drums, bass, other), set gains/active, clear. */
  setStems?(data: { stems: Int16Array[][]; scales: number[]; sampleRate: number; length: number }): Promise<void>;
  setStemGains?(gains: number[], active: boolean): void;
  clearStems?(): void;
  /** Key lock (master tempo) and key shift in semitones (WebAudio only). */
  setKeylock?(on: boolean): Promise<void> | void;
  setKeyShift?(semitones: number): void;
  /** Extract PCM slice for sampler capture (WebAudio only). */
  captureSlice?(startSec: number, endSec: number): Promise<AudioBuffer | null>;
  dispose(): void;
}
