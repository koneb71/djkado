import type { MusicSource, SourceAccount, SourceStatus } from '../sources/MusicSource';
import { SourceEvents } from '../sources/MusicSource';
import { getAccessToken, handleCallback, loadTokens, signOut, spotifyClientId, startLogin } from './auth';
import { SpotifyApi } from './api';
import type { TrackRef } from '@/services/tracks/TrackRef';
import type { Playlist } from '@/store/library';

export const spotifyConfigured = () => !!spotifyClientId();

/** Real Spotify source (PKCE + Web API). Activated when VITE_SPOTIFY_CLIENT_ID is set. */
export class SpotifySource implements MusicSource {
  readonly id = 'spotify' as const;
  readonly name = 'Spotify';
  readonly mock = false;
  private _status: SourceStatus = loadTokens() ? 'ready' : 'disconnected';
  private _account: SourceAccount | null = null;
  private events = new SourceEvents();
  private _notice: string | null = null;

  constructor() {
    if (window.location.pathname === '/callback/spotify') {
      this.set('connecting');
      handleCallback()
        .then((ok) => {
          this.set(ok ? 'ready' : 'disconnected');
          if (ok) this.fetchAccount();
        })
        .catch((e) => {
          this._notice = e.message;
          this.set('error');
        });
    } else if (this._status === 'ready') this.fetchAccount();
  }

  private async fetchAccount() {
    try {
      const me = await SpotifyApi.me();
      this._account = { displayName: me.display_name ?? 'Spotify user', avatarUrl: me.images?.[0]?.url, premium: me.product === 'premium' };
      if (me.product !== 'premium') this._notice = 'Spotify Premium is required to load tracks into a deck. Browsing works.';
      this.events.emit();
    } catch (e: any) {
      this._notice = e.message;
      this.set('error');
    }
  }
  status() {
    return this._status;
  }
  account() {
    return this._account;
  }
  notice() {
    return this._notice;
  }
  subscribe(cb: () => void) {
    return this.events.subscribe(cb);
  }
  private set(s: SourceStatus) {
    this._status = s;
    this.events.emit();
  }
  async connect() {
    await startLogin();
  }
  async disconnect() {
    signOut();
    this._account = null;
    this.set('disconnected');
  }
  async getPlaylists(): Promise<Playlist[]> {
    await getAccessToken();
    return SpotifyApi.playlists();
  }
  getPlaylistTracks(id: string): Promise<TrackRef[]> {
    return SpotifyApi.playlistTracks(id);
  }
  search(q: string): Promise<TrackRef[]> {
    return SpotifyApi.search(q);
  }
}
