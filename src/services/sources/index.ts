import { useSyncExternalStore } from 'react';
import type { MusicSource } from './MusicSource';
import { MockStreamSource } from './MockStreamSource';
import { SpotifySource, spotifyConfigured } from '../spotify/SpotifySource';
import { AppleMusicSource, appleConfigured } from '../appleMusic/AppleMusicSource';

/**
 * Source registry with feature flags: real adapters activate when credentials exist,
 * otherwise the mock sources provide the same UX with demo data.
 */
const SPOTIFY_HINT =
  'Mock mode — to use your real Spotify account, create an app at developer.spotify.com, add the redirect URI http://127.0.0.1:5173/callback/spotify and set VITE_SPOTIFY_CLIENT_ID in .env (Premium required for playback).';
const APPLE_HINT = 'Mock mode — to use your real Apple Music library, set APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY_PATH for the token server (Apple Developer Program required).';

let spotify: MusicSource | null = null;
let apple: MusicSource | null = null;

export function getSource(id: 'spotify' | 'apple'): MusicSource {
  if (id === 'spotify') {
    if (!spotify) spotify = spotifyConfigured() ? new SpotifySource() : new MockStreamSource('spotify', 'Spotify', SPOTIFY_HINT);
    return spotify;
  }
  if (!apple) apple = appleConfigured() ? new AppleMusicSource() : new MockStreamSource('apple', 'Apple Music', APPLE_HINT);
  return apple;
}

/** React hook: re-render when a source's status changes. */
export function useSource(id: 'spotify' | 'apple') {
  const src = getSource(id);
  const status = useSyncExternalStore(
    (cb) => src.subscribe(cb),
    () => src.status(),
  );
  return { src, status };
}
