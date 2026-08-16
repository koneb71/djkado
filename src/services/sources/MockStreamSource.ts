import type { MusicSource, SourceAccount, SourceStatus } from './MusicSource';
import { SourceEvents } from './MusicSource';
import { makeMockCatalog } from './mockData';
import type { TrackRef } from '@/services/tracks/TrackRef';
import type { Playlist } from '@/store/library';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stand-in for Spotify / Apple Music when no developer credentials are configured.
 * Same interface & UX (connect card → playlists → tracks → load to Stream Deck), demo data only.
 */
export class MockStreamSource implements MusicSource {
  readonly mock = true;
  private _status: SourceStatus = 'disconnected';
  private events = new SourceEvents();
  private catalog: ReturnType<typeof makeMockCatalog>;
  private demoPreviews: TrackRef[];

  constructor(readonly id: 'spotify' | 'apple', readonly name: string, private setupHint: string) {
    this.catalog = makeMockCatalog(id);
    // Apple Music catalog previews are real audio → full engine. We ship a couple of synthesized demo clips.
    this.demoPreviews =
      id === 'apple'
        ? [
            { kind: 'demo', url: '/demo/demo-house-124.wav', meta: { id: 'apple:preview:demo1', title: 'Demo Groove (30s preview)', artist: 'DJKado', bpm: 124, durationSec: 30, addedAt: Date.now() } },
            { kind: 'demo', url: '/demo/demo-techno-130.wav', meta: { id: 'apple:preview:demo2', title: 'Demo Pulse (30s preview)', artist: 'DJKado', bpm: 130, durationSec: 30, addedAt: Date.now() } },
          ]
        : [];
    const saved = localStorage.getItem(`djkado.mock.${id}.connected`);
    if (saved === '1') this._status = 'ready';
  }

  status() {
    return this._status;
  }
  account(): SourceAccount | null {
    return this._status === 'ready' ? { displayName: this.id === 'spotify' ? 'demo_dj (Premium)' : 'Demo DJ', premium: true } : null;
  }
  notice() {
    return this.setupHint;
  }
  subscribe(cb: () => void) {
    return this.events.subscribe(cb);
  }
  private set(s: SourceStatus) {
    this._status = s;
    this.events.emit();
  }
  async connect() {
    this.set('connecting');
    await sleep(900);
    this.set('ready');
    localStorage.setItem(`djkado.mock.${this.id}.connected`, '1');
  }
  async disconnect() {
    this.set('disconnected');
    localStorage.removeItem(`djkado.mock.${this.id}.connected`);
  }
  async getPlaylists(): Promise<Playlist[]> {
    await sleep(350);
    const extra: Playlist[] = this.id === 'apple' ? [{ id: 'apple:pl:previews', name: 'Catalog previews (full engine)', source: 'apple', trackCount: this.demoPreviews.length }] : [];
    return [...extra, ...this.catalog.playlists];
  }
  async getPlaylistTracks(playlistId: string): Promise<TrackRef[]> {
    await sleep(300);
    if (playlistId === 'apple:pl:previews') return this.demoPreviews;
    return this.catalog.tracks[playlistId] ?? [];
  }
  async search(query: string): Promise<TrackRef[]> {
    await sleep(250);
    const q = query.toLowerCase();
    return [...this.demoPreviews, ...this.catalog.all].filter((t) => `${t.meta.title} ${t.meta.artist} ${t.meta.album ?? ''}`.toLowerCase().includes(q)).slice(0, 50);
  }
}
