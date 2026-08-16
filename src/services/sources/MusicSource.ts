import type { TrackRef } from '@/services/tracks/TrackRef';
import type { Playlist } from '@/store/library';

export type SourceStatus = 'disconnected' | 'connecting' | 'ready' | 'unavailable' | 'error';

export interface SourceAccount {
  displayName: string;
  avatarUrl?: string;
  premium?: boolean;
}

/**
 * A browsable music catalogue (local files, Spotify, Apple Music …).
 * Sources only *list* tracks; the Deck picks a backend from the TrackRef kind.
 */
export interface MusicSource {
  readonly id: 'local' | 'spotify' | 'apple';
  readonly name: string;
  /** true when running against a mock (no credentials configured) */
  readonly mock: boolean;
  status(): SourceStatus;
  account(): SourceAccount | null;
  /** Human-readable reason when unavailable/mock, shown on the connect card. */
  notice(): string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getPlaylists(): Promise<Playlist[]>;
  getPlaylistTracks(playlistId: string): Promise<TrackRef[]>;
  search(query: string): Promise<TrackRef[]>;
  subscribe(cb: () => void): () => void;
}

/** Tiny event helper for sources. */
export class SourceEvents {
  private subs = new Set<() => void>();
  subscribe(cb: () => void) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  emit() {
    this.subs.forEach((s) => s());
  }
}
