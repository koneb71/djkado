import type { TrackRef } from './TrackRef';
import { nativeFileUrl } from '@/mobile/nativeFiles';

/** URL a decodable track can be fetched from, or null for File-backed / undecodable tracks. */
export function urlOf(track: TrackRef): string | null {
  switch (track.kind) {
    case 'native':
      return nativeFileUrl(track.uri);
    case 'demo':
      return track.url;
    case 'apple-preview':
      return track.previewUrl;
    default:
      return null;
  }
}

/**
 * Raw bytes of any decodable track (local File, Android SAF document, demo/preview URL).
 *
 * IMPORTANT (Android): always read the whole body — never send a Range header and never hand a
 * native URL to <audio>/MediaSource. Capacitor's local server answers 206 with a Content-Range but
 * streams from byte 0 regardless, so a ranged read returns silently wrong audio.
 */
export async function arrayBufferOf(track: TrackRef, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (track.kind === 'local') return track.file.arrayBuffer();
  const url = urlOf(track);
  if (!url) throw new Error(`Track "${track.meta.title}" cannot be decoded (${track.kind})`);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Failed to read audio (${res.status})`);
  return res.arrayBuffer();
}

/** Blob view of a decodable track — for tag parsing (music-metadata needs a Blob). */
export async function blobOf(track: TrackRef): Promise<Blob | null> {
  if (track.kind === 'local') return track.file;
  const url = urlOf(track);
  if (!url) return null;
  try {
    const res = await fetch(url);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}
