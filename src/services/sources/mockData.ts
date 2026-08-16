import type { TrackRef, TrackMeta } from '@/services/tracks/TrackRef';
import type { Playlist } from '@/store/library';

/** Deterministic pseudo-random for stable mock data. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const ARTISTS = ['Neon Harbor', 'Kaya Ostrova', 'Delta Bloom', 'Marlow & Vex', 'Aurelia', 'Tidewater', 'Solstice Kid', 'Fenna Ryde', 'Blackline', 'Orbit 9', 'Lumen', 'Cassio', 'Wren Alder', 'Ivo Sato', 'The Late Set'];
const TITLES = ['Midnight Runner', 'Glasshouse', 'Afterlight', 'Pulse Theory', 'Cobalt Sky', 'Slow Burn', 'Echo Chamber', 'Paper Planes', 'Riverbed', 'Static Love', 'North Star', 'Velvet Loop', 'Free Fall', 'Marigold', 'Overdrive', 'Ghost Signal', 'Second Sun', 'Undertow', 'Halcyon', 'Low Tide', 'Skyline', 'Ember', 'Wavelength', 'Parallel', 'Kinetic'];
const KEYS = ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A', '1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B', '9B', '10B', '11B', '12B'];

const GENRES: Record<string, [number, number]> = { House: [120, 128], Techno: [125, 138], 'Drum & Bass': [170, 176], 'Hip-Hop': [85, 100], Pop: [98, 124], Disco: [110, 122] };

function artUrl(seed: number, a: string, b: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='120' height='120' fill='url(%23g)'/><circle cx='${30 + (seed % 60)}' cy='${40 + (seed % 40)}' r='${18 + (seed % 20)}' fill='rgba(255,255,255,0.18)'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PALETTES = [
  ['#22d3ee', '#0f172a'],
  ['#f59e0b', '#7c2d12'],
  ['#a78bfa', '#1e1b4b'],
  ['#f472b6', '#4a044e'],
  ['#22c55e', '#052e16'],
  ['#60a5fa', '#0c1a3a'],
];

export function makeMockCatalog(provider: 'spotify' | 'apple', count = 60): { playlists: Playlist[]; tracks: Record<string, TrackRef[]>; all: TrackRef[] } {
  const r = rng(provider === 'spotify' ? 1337 : 4242);
  const genres = Object.keys(GENRES);
  const all: TrackRef[] = [];
  for (let i = 0; i < count; i++) {
    const genre = genres[Math.floor(r() * genres.length)];
    const [lo, hi] = GENRES[genre];
    const bpm = Math.round((lo + r() * (hi - lo)) * 10) / 10;
    const pal = PALETTES[Math.floor(r() * PALETTES.length)];
    const id = `${provider}:mock:${i}`;
    const meta: TrackMeta = {
      id,
      title: TITLES[Math.floor(r() * TITLES.length)] + (r() > 0.7 ? ' (Extended Mix)' : ''),
      artist: ARTISTS[Math.floor(r() * ARTISTS.length)],
      album: `${TITLES[Math.floor(r() * TITLES.length)]} EP`,
      durationSec: Math.round(180 + r() * 240),
      artworkUrl: artUrl(i * 7 + (provider === 'spotify' ? 3 : 11), pal[0], pal[1]),
      bpm: provider === 'apple' ? bpm : undefined, // Spotify's audio-features endpoint is gone for new apps
      key: provider === 'apple' ? KEYS[Math.floor(r() * KEYS.length)] : undefined,
      genre,
      year: 2016 + Math.floor(r() * 10),
      addedAt: Date.now() - Math.floor(r() * 1e10),
    };
    all.push({ kind: 'mock-stream', provider, meta });
  }
  const names = provider === 'spotify' ? ['Liked Songs', 'Peak Time Techno', 'Sunset House Set', 'Discover Weekly', 'DnB Rollers', 'Warm-Up Grooves'] : ['Favorites', 'Club Essentials', 'Deep & Melodic', 'New Music Mix', 'Jungle & DnB', 'Late Night Disco'];
  const playlists: Playlist[] = [];
  const tracks: Record<string, TrackRef[]> = {};
  names.forEach((name, i) => {
    const pid = `${provider}:pl:${i}`;
    const subset = all.filter((_, j) => (j * 31 + i * 17) % 7 < 3 || i === 0);
    playlists.push({ id: pid, name, source: provider, trackCount: subset.length, artworkUrl: subset[0]?.meta.artworkUrl });
    tracks[pid] = subset;
  });
  return { playlists, tracks, all };
}
