/** Where a track comes from and how it can be played. */
export type TrackSourceKind = 'local' | 'native' | 'apple-preview' | 'apple-stream' | 'spotify-stream' | 'mock-stream' | 'demo';

export interface TrackMeta {
  id: string; // stable key: local/native => `local:name|size|mtime` (see trackKeyFor) ; stream => provider:id
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  artworkUrl?: string;
  bpm?: number;
  key?: string; // Camelot
  genre?: string;
  year?: number;
  addedAt?: number;
  playCount?: number;
}

export type TrackRef =
  | { kind: 'local'; meta: TrackMeta; file: File }
  /** Android SAF document (content:// URI with a persisted read grant) — read through nativeFileUrl() */
  | { kind: 'native'; meta: TrackMeta; uri: string }
  | { kind: 'demo'; meta: TrackMeta; url: string }
  | { kind: 'apple-preview'; meta: TrackMeta; previewUrl: string; catalogId: string }
  | { kind: 'apple-stream'; meta: TrackMeta; catalogId: string }
  | { kind: 'spotify-stream'; meta: TrackMeta; uri: string }
  | { kind: 'mock-stream'; meta: TrackMeta; provider: 'spotify' | 'apple' };

export const isStreamTrack = (t: TrackRef | null | undefined): boolean =>
  !!t && (t.kind === 'apple-stream' || t.kind === 'spotify-stream' || t.kind === 'mock-stream');

export const providerOf = (t: TrackRef): 'local' | 'spotify' | 'apple' | 'demo' => {
  switch (t.kind) {
    case 'local':
    case 'native':
      return 'local';
    case 'demo':
      return 'demo';
    case 'apple-preview':
    case 'apple-stream':
      return 'apple';
    case 'spotify-stream':
      return 'spotify';
    case 'mock-stream':
      return t.provider;
  }
};
