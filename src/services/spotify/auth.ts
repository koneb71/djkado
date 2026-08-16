/**
 * Spotify OAuth 2.0 Authorization Code with PKCE — fully client-side (no secret).
 * Redirect URI must match exactly in the Spotify dashboard (Spotify rejects `localhost`;
 * use the 127.0.0.1 loopback address).
 */
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
/** Origin-relative by default so it works for web dev (127.0.0.1:5173) and the desktop app (127.0.0.1:47831). */
const REDIRECT_URI = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) || (typeof location !== 'undefined' ? `${location.origin}/callback/spotify` : 'http://127.0.0.1:5173/callback/spotify');
const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-library-read', 'playlist-read-private', 'playlist-read-collaborative', 'user-top-read', 'user-read-playback-state', 'user-modify-playback-state'];
const STORE_KEY = 'djkado.spotify.auth';

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export const spotifyClientId = () => CLIENT_ID || '';

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return b64url(digest);
}

export function randomVerifier(len = 64): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

export function loadTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as SpotifyTokens) : null;
  } catch {
    return null;
  }
}
export function saveTokens(t: SpotifyTokens | null) {
  if (t) localStorage.setItem(STORE_KEY, JSON.stringify(t));
  else localStorage.removeItem(STORE_KEY);
}

export async function startLogin(): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_SPOTIFY_CLIENT_ID is not configured');
  const verifier = randomVerifier();
  const challenge = await pkceChallenge(verifier);
  const state = randomVerifier(16);
  sessionStorage.setItem('djkado.spotify.verifier', verifier);
  sessionStorage.setItem('djkado.spotify.state', state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/** Call on /callback/spotify: exchanges the code and stores tokens. Returns true on success. */
export async function handleCallback(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code) return false;
  if (state !== sessionStorage.getItem('djkado.spotify.state')) throw new Error('OAuth state mismatch');
  const verifier = sessionStorage.getItem('djkado.spotify.verifier') ?? '';
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, client_id: CLIENT_ID!, code_verifier: verifier });
  const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const j = await res.json();
  saveTokens({ accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 });
  sessionStorage.removeItem('djkado.spotify.verifier');
  sessionStorage.removeItem('djkado.spotify.state');
  window.history.replaceState({}, '', '/');
  return true;
}

let refreshing: Promise<string> | null = null;

/** Returns a valid access token, refreshing 60 s early. Single-flight. */
export async function getAccessToken(): Promise<string> {
  const t = loadTokens();
  if (!t) throw new Error('Not signed in to Spotify');
  if (Date.now() < t.expiresAt - 60_000) return t.accessToken;
  if (!refreshing) {
    refreshing = (async () => {
      const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: CLIENT_ID! });
      const res = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!res.ok) {
        saveTokens(null);
        throw new Error('Spotify session expired — please reconnect');
      }
      const j = await res.json();
      // PKCE refresh rotates the refresh token
      saveTokens({ accessToken: j.access_token, refreshToken: j.refresh_token ?? t.refreshToken, expiresAt: Date.now() + j.expires_in * 1000 });
      return j.access_token as string;
    })().finally(() => (refreshing = null));
  }
  return refreshing;
}

export function signOut() {
  saveTokens(null);
}
