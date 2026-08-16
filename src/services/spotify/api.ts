import { z } from 'zod';
import { getAccessToken } from './auth';
import type { TrackRef } from '@/services/tracks/TrackRef';
import type { Playlist } from '@/store/library';

const BASE = 'https://api.spotify.com/v1';

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After') ?? '1') * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return get(path, schema);
  }
  if (!res.ok) throw new Error(`Spotify API ${res.status}`);
  return schema.parse(await res.json());
}

const Image = z.object({ url: z.string(), width: z.number().nullable().optional(), height: z.number().nullable().optional() });
const TrackObj = z.object({
  id: z.string().nullable(),
  uri: z.string(),
  name: z.string(),
  duration_ms: z.number(),
  artists: z.array(z.object({ name: z.string() })),
  album: z.object({ name: z.string(), images: z.array(Image), release_date: z.string().optional() }).optional(),
});
const Paged = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item), next: z.string().nullable(), total: z.number().optional() });

export const MeSchema = z.object({ display_name: z.string().nullable(), product: z.string().optional(), images: z.array(Image).optional() });

export function toTrackRef(t: z.infer<typeof TrackObj>): TrackRef {
  return {
    kind: 'spotify-stream',
    uri: t.uri,
    meta: {
      id: `spotify:${t.id ?? t.uri}`,
      title: t.name,
      artist: t.artists.map((a) => a.name).join(', '),
      album: t.album?.name,
      durationSec: t.duration_ms / 1000,
      artworkUrl: t.album?.images?.at(-1)?.url,
      year: t.album?.release_date ? Number(t.album.release_date.slice(0, 4)) : undefined,
    },
  };
}

export const SpotifyApi = {
  me: () => get('/me', MeSchema),
  async playlists(): Promise<Playlist[]> {
    const out: Playlist[] = [{ id: 'liked', name: 'Liked Songs', source: 'spotify' }];
    let url: string | null = '/me/playlists?limit=50';
    while (url) {
      const page: z.infer<ReturnType<typeof Paged<z.ZodTypeAny>>> = await get(url, Paged(z.object({ id: z.string(), name: z.string(), images: z.array(Image).nullable().optional(), tracks: z.object({ total: z.number() }).optional() })));
      for (const p of page.items as any[]) out.push({ id: p.id, name: p.name, source: 'spotify', trackCount: p.tracks?.total, artworkUrl: p.images?.[0]?.url });
      url = page.next;
    }
    return out;
  },
  async playlistTracks(id: string): Promise<TrackRef[]> {
    const out: TrackRef[] = [];
    let url: string | null = id === 'liked' ? '/me/tracks?limit=50' : `/playlists/${id}/tracks?limit=100`;
    while (url) {
      const page: any = await get(url, Paged(z.object({ track: TrackObj.nullable() })));
      for (const it of page.items) if (it.track?.id) out.push(toTrackRef(it.track));
      url = page.next;
    }
    return out;
  },
  async search(q: string): Promise<TrackRef[]> {
    const res = await get(`/search?type=track&limit=30&q=${encodeURIComponent(q)}`, z.object({ tracks: Paged(TrackObj) }));
    return res.tracks.items.filter((t) => t.id).map(toTrackRef);
  },
  async play(deviceId: string, uri: string, positionMs = 0) {
    const token = await getAccessToken();
    await fetch(`${BASE}/me/player/play?device_id=${deviceId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ uris: [uri], position_ms: positionMs }) });
  },
};
