import type { MusicSource, SourceAccount, SourceStatus } from '../sources/MusicSource';
import { SourceEvents } from '../sources/MusicSource';
import { getDeveloperToken } from './developerToken';
import { loadMusicKit } from './musickit';
import type { TrackRef, TrackMeta } from '@/services/tracks/TrackRef';
import type { Playlist } from '@/store/library';

/** The real adapter activates when the token server answers (APPLE_* env configured). */
export const appleConfigured = () => localStorage.getItem('djkado.apple.available') === '1';

// Probe the token endpoint once at startup so the registry can pick the real adapter next load.
if (typeof window !== 'undefined') {
  fetch('/api/apple/developer-token', { method: 'HEAD' })
    .then((r) => localStorage.setItem('djkado.apple.available', r.ok ? '1' : '0'))
    .catch(() => localStorage.setItem('djkado.apple.available', '0'));
}

function artwork(a: any, size = 120): string | undefined {
  return a?.url?.replace('{w}', String(size)).replace('{h}', String(size));
}

/** Real Apple Music source via MusicKit JS v3. */
export class AppleMusicSource implements MusicSource {
  readonly id = 'apple' as const;
  readonly name = 'Apple Music';
  readonly mock = false;
  private _status: SourceStatus = 'disconnected';
  private _account: SourceAccount | null = null;
  private _notice: string | null = null;
  private events = new SourceEvents();
  private music: any = null;

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
  private async ensure() {
    if (this.music) return this.music;
    const token = await getDeveloperToken();
    if (!token) throw new Error('Apple developer token unavailable');
    this.music = await loadMusicKit(token);
    return this.music;
  }
  async connect() {
    this.set('connecting');
    try {
      const m = await this.ensure();
      await m.authorize(); // must be inside a user gesture (popup)
      this._account = { displayName: 'Apple Music', premium: !m.previewOnly };
      if (m.previewOnly) this._notice = 'No active Apple Music subscription — 30 s previews only (they still get the full DJ engine).';
      this.set('ready');
    } catch (e: any) {
      this._notice = e?.message ?? 'Authorization failed';
      this.set('error');
    }
  }
  async disconnect() {
    try {
      await this.music?.unauthorize();
    } catch {
      /* noop */
    }
    this._account = null;
    this.set('disconnected');
  }
  private toRef(song: any, preferPreview: boolean): TrackRef | null {
    const a = song.attributes ?? {};
    const catalogId: string | undefined = song.attributes?.playParams?.catalogId ?? (song.type === 'songs' ? song.id : undefined);
    if (!catalogId) return null;
    const meta: TrackMeta = { id: `apple:${catalogId}`, title: a.name, artist: a.artistName, album: a.albumName, durationSec: (a.durationInMillis ?? 0) / 1000, artworkUrl: artwork(a.artwork), genre: a.genreNames?.[0], year: a.releaseDate ? Number(String(a.releaseDate).slice(0, 4)) : undefined };
    const preview = a.previews?.[0]?.url;
    if (preferPreview && preview) return { kind: 'apple-preview', previewUrl: preview, catalogId, meta: { ...meta, id: `apple:preview:${catalogId}`, title: `${a.name} (preview)` } };
    return { kind: 'apple-stream', catalogId, meta };
  }
  async getPlaylists(): Promise<Playlist[]> {
    const m = await this.ensure();
    const res = await m.api.music('/v1/me/library/playlists', { limit: 100 });
    const items = res?.data?.data ?? [];
    return [{ id: 'recent', name: 'Recently played', source: 'apple' }, ...items.map((p: any) => ({ id: p.id, name: p.attributes?.name ?? 'Playlist', source: 'apple' as const, artworkUrl: artwork(p.attributes?.artwork) }))];
  }
  async getPlaylistTracks(id: string): Promise<TrackRef[]> {
    const m = await this.ensure();
    const path = id === 'recent' ? '/v1/me/recent/played/tracks' : `/v1/me/library/playlists/${id}/tracks`;
    const res = await m.api.music(path, { limit: 100 });
    const items: any[] = res?.data?.data ?? [];
    const out: TrackRef[] = [];
    for (const s of items) {
      const stream = this.toRef(s, false);
      if (stream) out.push(stream);
    }
    return out;
  }
  async search(q: string): Promise<TrackRef[]> {
    const m = await this.ensure();
    const res = await m.api.music(`/v1/catalog/{{storefrontId}}/search`, { term: q, types: 'songs', limit: 25 });
    const songs: any[] = res?.data?.results?.songs?.data ?? [];
    const out: TrackRef[] = [];
    for (const s of songs) {
      const stream = this.toRef(s, false);
      const prev = this.toRef(s, true);
      if (stream) out.push(stream);
      if (prev && prev.kind === 'apple-preview') out.push(prev);
    }
    return out;
  }
}
