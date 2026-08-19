import { Capacitor, registerPlugin } from '@capacitor/core';

/** One audio document returned by the native picker / folder scan. */
export interface NativeFile {
  uri: string;
  name: string;
  size: number;
  /** epoch ms (0 when the provider doesn't report it) */
  lastModified: number;
  mimeType?: string;
  relativePath?: string;
  /** false when Android refused a persistable grant (per-app ceiling) — plays now, gone next launch */
  persisted?: boolean;
}

export interface NativeFolder {
  uri: string;
  name: string;
  addedAt?: number;
}

export interface NativeMetadata {
  uri: string;
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  genre?: string;
  year?: string;
  date?: string;
  durationSec?: number;
  hasArtwork?: boolean;
  /** base64 (only when requested) */
  artwork?: string;
}

interface DjkadoFilesPlugin {
  pickFiles(): Promise<{ cancelled: boolean; files: NativeFile[] }>;
  pickFolder(): Promise<{ cancelled: boolean; uri?: string; name?: string }>;
  listFolder(options: { uri: string; maxDepth?: number; limit?: number }): Promise<{ uri: string; name: string; files: NativeFile[] }>;
  savedFolders(): Promise<{ folders: NativeFolder[] }>;
  forgetFolder(options: { uri: string }): Promise<void>;
  hasAccess(options: { uri: string }): Promise<{ granted: boolean }>;
  /** Native tag read (MediaMetadataRetriever) — no file download into the WebView. */
  readMetadata(options: { uris: string[]; artwork?: boolean }): Promise<{ tracks: NativeMetadata[] }>;
}

/**
 * Android Storage Access Framework bridge (see android/app/src/main/java/com/djkado/app/FilesPlugin.java).
 * Read permission on picked files/folders is persisted by Android, so the library survives restarts.
 */
export const NativeFiles = registerPlugin<DjkadoFilesPlugin>('DjkadoFiles');

export const hasNativeFiles = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('DjkadoFiles');

/** content:// → an https://localhost/_capacitor_content_/… URL that fetch() can read (same origin). */
export const nativeFileUrl = (uri: string) => Capacitor.convertFileSrc(uri);
