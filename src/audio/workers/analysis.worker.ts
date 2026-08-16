import * as Comlink from 'comlink';
import { detectTempo } from '../dsp/bpm';
import { detectKey } from '../dsp/key';
import { computeWaveform } from '../dsp/waveform';
import { computeAutoGainDb } from '../dsp/gain';
import { decimate } from '../dsp/math';
import type { AnalysisResult } from '../engine/types';

export interface AnalyzeInput {
  mono: Float32Array;
  sampleRate: number;
}

export type ProgressCb = (p: number, stage: string) => void;

const api = {
  async analyze(input: AnalyzeInput, onProgress?: ProgressCb): Promise<AnalysisResult> {
    const { mono, sampleRate } = input;
    const duration = mono.length / sampleRate;
    const report = (p: number, s: string) => onProgress?.(p, s);

    report(0.05, 'waveform');
    const waveform = computeWaveform(mono, sampleRate, 100);

    report(0.35, 'gain');
    const gainDb = computeAutoGainDb(mono, sampleRate);

    report(0.45, 'tempo');
    const tempo = detectTempo(mono, sampleRate);

    report(0.75, 'key');
    // key on 22.05k for speed
    const kf = Math.max(1, Math.round(sampleRate / 22050));
    const monoK = decimate(mono, kf);
    const key = detectKey(monoK, sampleRate / kf);

    report(1, 'done');
    return {
      duration,
      bpm: tempo.bpm,
      bpmConfidence: tempo.confidence,
      firstBeatSec: tempo.firstBeatSec,
      key: { camelot: key.camelot, name: key.name, confidence: key.confidence },
      waveform,
      gainDb,
    };
  },
};

export type AnalysisApi = typeof api;
Comlink.expose(api);
