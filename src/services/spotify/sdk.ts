import { getAccessToken } from './auth';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: any;
  }
}

let sdkPromise: Promise<any> | null = null;

/** Inject https://sdk.scdn.co/spotify-player.js once and resolve with the global `Spotify` namespace. */
export function loadSpotifySdk(): Promise<any> {
  if (window.Spotify) return Promise.resolve(window.Spotify);
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
      const s = document.createElement('script');
      s.src = 'https://sdk.scdn.co/spotify-player.js';
      s.async = true;
      s.onerror = () => reject(new Error('Failed to load Spotify Web Playback SDK'));
      document.head.appendChild(s);
    });
  }
  return sdkPromise;
}

export interface SpotifyPlayerHandle {
  player: any;
  deviceId: string;
}

let playerPromise: Promise<SpotifyPlayerHandle> | null = null;

/** Create (once) the DJKado Connect device. Must be called after a user gesture. */
export function getSpotifyPlayer(): Promise<SpotifyPlayerHandle> {
  if (!playerPromise) {
    playerPromise = loadSpotifySdk().then(
      (Spotify) =>
        new Promise<SpotifyPlayerHandle>((resolve, reject) => {
          const player = new Spotify.Player({ name: 'DJKado', getOAuthToken: (cb: (t: string) => void) => getAccessToken().then(cb), volume: 1 });
          player.addListener('ready', ({ device_id }: { device_id: string }) => resolve({ player, deviceId: device_id }));
          player.addListener('initialization_error', ({ message }: { message: string }) => reject(new Error(message)));
          player.addListener('authentication_error', ({ message }: { message: string }) => reject(new Error(message)));
          player.addListener('account_error', () => reject(new Error('Spotify Premium is required for playback')));
          player.connect();
          player.activateElement?.();
        }),
    );
    playerPromise.catch(() => (playerPromise = null));
  }
  return playerPromise;
}
