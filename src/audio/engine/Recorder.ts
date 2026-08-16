import { create } from 'zustand';
import type { MasterBus } from './MasterBus';

interface RecorderStore {
  recording: boolean;
  startedAt: number;
  elapsed: number;
  lastFile: { url: string; name: string; size: number } | null;
  format: 'webm' | 'mp4' | 'wav';
}

export const useRecorder = create<RecorderStore>(() => ({ recording: false, startedAt: 0, elapsed: 0, lastFile: null, format: 'webm' }));

/**
 * Records the master bus via MediaRecorder (webm/opus or mp4/aac depending on browser),
 * or as 32-bit float → 16-bit WAV via a ScriptProcessor-free tap (AnalyserNode-based capture
 * isn't gapless, so WAV mode records from a MediaStreamDestination through an AudioWorklet-free
 * approach: we decode the MediaRecorder blob after stop and encode WAV).
 */
export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: number | null = null;

  constructor(private ctx: AudioContext, private master: MasterBus) {}

  get supported() {
    return typeof MediaRecorder !== 'undefined';
  }

  private pickMime(): { mime: string; ext: 'webm' | 'mp4' } {
    const candidates: [string, 'webm' | 'mp4'][] = [
      ['audio/webm;codecs=opus', 'webm'],
      ['audio/webm', 'webm'],
      ['audio/mp4;codecs=mp4a.40.2', 'mp4'],
      ['audio/mp4', 'mp4'],
    ];
    for (const [m, ext] of candidates) if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext };
    return { mime: '', ext: 'webm' };
  }

  start() {
    if (this.rec) return;
    const stream = this.master.getRecordingStream();
    const { mime, ext } = this.pickMime();
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 256_000 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.rec.onstop = async () => {
      const blob = new Blob(this.chunks, { type: mime || 'audio/webm' });
      const wantWav = useRecorder.getState().format === 'wav';
      let out = blob;
      let outExt: string = ext;
      if (wantWav) {
        try {
          out = await this.toWav(blob);
          outExt = 'wav';
        } catch (e) {
          console.warn('WAV encode failed, keeping compressed file', e);
        }
      }
      const name = `DJKado-${stamp()}.${outExt}`;
      const url = URL.createObjectURL(out);
      const prev = useRecorder.getState().lastFile;
      if (prev) URL.revokeObjectURL(prev.url);
      useRecorder.setState({ lastFile: { url, name, size: out.size } });
      // auto-download
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
    };
    this.rec.start(1000);
    useRecorder.setState({ recording: true, startedAt: Date.now(), elapsed: 0 });
    this.timer = window.setInterval(() => useRecorder.setState({ elapsed: (Date.now() - useRecorder.getState().startedAt) / 1000 }), 500);
  }

  stop() {
    if (!this.rec) return;
    this.rec.stop();
    this.rec = null;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    useRecorder.setState({ recording: false });
  }

  toggle() {
    if (this.rec) this.stop();
    else this.start();
  }

  private async toWav(blob: Blob): Promise<Blob> {
    const ab = await blob.arrayBuffer();
    const audio = await this.ctx.decodeAudioData(ab);
    return encodeWav(audio);
  }
}

function stamp() {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function encodeWav(audio: AudioBuffer): Blob {
  const nCh = audio.numberOfChannels;
  const len = audio.length;
  const bytes = 44 + len * nCh * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const wstr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  wstr(0, 'RIFF');
  v.setUint32(4, bytes - 8, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nCh, true);
  v.setUint32(24, audio.sampleRate, true);
  v.setUint32(28, audio.sampleRate * nCh * 2, true);
  v.setUint16(32, nCh * 2, true);
  v.setUint16(34, 16, true);
  wstr(36, 'data');
  v.setUint32(40, len * nCh * 2, true);
  const chans = Array.from({ length: nCh }, (_, c) => audio.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}
