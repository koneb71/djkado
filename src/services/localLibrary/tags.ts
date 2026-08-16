import type { TrackMeta } from '@/services/tracks/TrackRef';

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|aif|aiff|webm|mp4)$/i;

export const isAudioFile = (f: File) => AUDIO_EXT.test(f.name) || f.type.startsWith('audio/');

export function trackKeyForFile(f: File): string {
  return `local:${f.name}|${f.size}|${f.lastModified}`;
}

/** Guess "Artist - Title" from a filename. */
export function metaFromFilename(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
  const m = /^(.*?)\s+-\s+(.*)$/.exec(base);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { title: base, artist: 'Unknown Artist' };
}

/**
 * Read ID3/Vorbis/MP4 tags + embedded artwork with music-metadata (lazy-loaded chunk).
 * Falls back to filename parsing.
 */
export async function readTags(file: File): Promise<Partial<TrackMeta>> {
  const guess = metaFromFilename(file.name);
  try {
    const mm = await import('music-metadata');
    const md = await mm.parseBlob(file, { duration: true, skipCovers: false });
    const c = md.common;
    let artworkUrl: string | undefined;
    const pic = c.picture?.[0];
    if (pic) {
      const blob = new Blob([pic.data as BlobPart], { type: pic.format });
      artworkUrl = URL.createObjectURL(blob);
    }
    return {
      title: c.title?.trim() || guess.title,
      artist: (c.artists?.join(', ') || c.artist || '').trim() || guess.artist,
      album: c.album ?? undefined,
      genre: c.genre?.[0],
      year: c.year,
      bpm: c.bpm ? Number(c.bpm) : undefined,
      key: normalizeKey(c.key),
      durationSec: md.format.duration,
      artworkUrl,
    };
  } catch {
    return guess;
  }
}

/** Convert common key notations (e.g. "Am", "8A", "F# minor") into Camelot when possible. */
export function normalizeKey(k?: string): string | undefined {
  if (!k) return undefined;
  const s = k.trim();
  if (/^\d{1,2}[AB]$/i.test(s)) return s.toUpperCase();
  const m = /^([A-G])(#|b)?\s*(m|min|minor|maj|major)?$/i.exec(s);
  if (!m) return undefined;
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  let pc = NOTES.indexOf(m[1].toUpperCase());
  if (m[2] === '#') pc = (pc + 1) % 12;
  if (m[2] === 'b') pc = (pc + 11) % 12;
  const minor = /^m/i.test(m[3] ?? '') && !/maj/i.test(m[3] ?? '');
  const MAJ: Record<number, string> = { 0: '8B', 1: '3B', 2: '10B', 3: '5B', 4: '12B', 5: '7B', 6: '2B', 7: '9B', 8: '4B', 9: '11B', 10: '6B', 11: '1B' };
  const MIN: Record<number, string> = { 0: '5A', 1: '12A', 2: '7A', 3: '2A', 4: '9A', 5: '4A', 6: '11A', 7: '6A', 8: '1A', 9: '8A', 10: '3A', 11: '10A' };
  return minor ? MIN[pc] : MAJ[pc];
}
