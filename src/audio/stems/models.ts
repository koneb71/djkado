/** Stem-separation model registry. Files are fetched from upstream at runtime and cached in Cache Storage. */
export interface StemModel {
  id: string;
  name: string;
  url: string; // pinned commit
  sha256: string;
  bytes: number;
  license: string;
  sampleRate: number;
  segment: number; // samples per model call
  overlap: number;
  fftSize: number;
  hop: number;
  specBins: number;
  specFrames: number;
  stems: readonly StemName[];
}

export type StemName = 'vocals' | 'drums' | 'bass' | 'other';
export const STEM_ORDER: readonly StemName[] = ['vocals', 'drums', 'bass', 'other'];

export const HTDEMUCS: StemModel = {
  id: 'htdemucs',
  name: 'HTDemucs (Demucs v4)',
  url: 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/92e33df61cfc9eb820272aaa62d2ef6dcf4d950d/htdemucs_embedded.onnx',
  sha256: 'e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077',
  bytes: 180_534_758,
  license: 'MIT (weights: Meta Demucs, MIT; export: timcsy/demucs-web)',
  sampleRate: 44100,
  segment: 343_980,
  overlap: 0.25,
  fftSize: 4096,
  hop: 1024,
  specBins: 2048,
  specFrames: 336,
  // model output order (drums, bass, other, vocals) is remapped to STEM_ORDER by the pipeline
  stems: STEM_ORDER,
};

export const DEFAULT_STEM_MODEL = HTDEMUCS;
