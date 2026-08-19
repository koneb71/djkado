package com.djkado.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;

/**
 * Storage Access Framework bridge for DJKado.
 *
 * Android's WebView has no File System Access API and no <input webkitdirectory>, so folder
 * picking is done natively. Read permission on the picked file/tree is *persisted* (survives
 * app restarts and reboots), which is what lets the library come back on the next launch.
 *
 * The returned content:// URIs are readable from the web layer with
 * fetch(Capacitor.convertFileSrc(uri)) — Capacitor serves them from the same https://localhost
 * origin via /_capacitor_content_/.
 */
@CapacitorPlugin(name = "DjkadoFiles")
public class FilesPlugin extends Plugin {

    private static final String[] AUDIO_MIME_TYPES = {
        "audio/*",
        "application/ogg",
        "application/x-ogg",
        "application/octet-stream" // some providers report this for flac/aiff/aac
    };

    private static final String[] AUDIO_EXTENSIONS = {
        ".mp3", ".m4a", ".m4b", ".aac", ".wav", ".wave", ".flac", ".ogg", ".oga", ".opus", ".aif", ".aiff", ".mp4", ".webm"
    };

    private static final String[] DOC_PROJECTION = {
        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
        DocumentsContract.Document.COLUMN_MIME_TYPE,
        DocumentsContract.Document.COLUMN_SIZE,
        DocumentsContract.Document.COLUMN_LAST_MODIFIED
    };

    /** true when the app can still read this document/tree (persisted grant survives restarts). */
    @PluginMethod
    public void hasAccess(PluginCall call) {
        String uri = call.getString("uri");
        JSObject ret = new JSObject();
        ret.put("granted", uri != null && isPermitted(uri));
        call.resolve(ret);
    }

    /** Folders the user granted earlier (from Android's persisted URI permissions). */
    @PluginMethod
    public void savedFolders(PluginCall call) {
        JSArray folders = new JSArray();
        for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (!p.isReadPermission()) continue;
            Uri uri = p.getUri();
            if (!DocumentsContract.isTreeUri(uri)) continue;
            JSObject o = new JSObject();
            o.put("uri", uri.toString());
            o.put("name", treeDisplayName(uri));
            o.put("addedAt", p.getPersistedTime());
            folders.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("folders", folders);
        call.resolve(ret);
    }

    /** Drop a previously granted folder. */
    @PluginMethod
    public void forgetFolder(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("uri is required");
            return;
        }
        try {
            getContext()
                .getContentResolver()
                .releasePersistableUriPermission(Uri.parse(uri), Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException ignored) {
            // already released
        }
        call.resolve();
    }

    /** Recursively list the audio files inside a previously picked tree. */
    @PluginMethod
    public void listFolder(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        int maxDepth = call.getInt("maxDepth", 8);
        int limit = call.getInt("limit", 10000);
        Uri tree = Uri.parse(uriStr);
        if (!isPermitted(uriStr)) {
            call.reject("no-access");
            return;
        }
        try {
            JSArray files = new JSArray();
            walk(tree, DocumentsContract.getTreeDocumentId(tree), "", 0, maxDepth, limit, files);
            JSObject ret = new JSObject();
            ret.put("uri", uriStr);
            ret.put("name", treeDisplayName(tree));
            ret.put("files", files);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("listFolder failed: " + e.getMessage(), e);
        }
    }

    /** OS file picker (multi-select, audio). Read permission is persisted per file. */
    @PluginMethod
    public void pickFiles(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, AUDIO_MIME_TYPES);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "filesPicked");
    }

    /** OS folder picker (ACTION_OPEN_DOCUMENT_TREE) + persisted read permission. */
    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void filesPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        JSArray files = new JSArray();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            ret.put("cancelled", true);
            ret.put("files", files);
            call.resolve(ret);
            return;
        }
        Intent data = result.getData();
        List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) {
            for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        ContentResolver resolver = getContext().getContentResolver();
        for (Uri uri : uris) {
            // check it is audio *before* spending one of the app's limited persisted-grant slots
            JSObject f = documentInfo(uri, "");
            if (f == null) continue;
            boolean persisted = true;
            try {
                resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (SecurityException e) {
                // one-shot provider, or the per-app persisted-grant ceiling is reached —
                // the file still plays this session, it just won't come back next launch
                persisted = false;
            }
            f.put("persisted", persisted);
            files.put(f);
        }
        ret.put("cancelled", false);
        ret.put("files", files);
        call.resolve(ret);
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri tree = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException e) {
            call.reject("Could not keep access to that folder: " + e.getMessage(), e);
            return;
        }
        ret.put("cancelled", false);
        ret.put("uri", tree.toString());
        ret.put("name", treeDisplayName(tree));
        call.resolve(ret);
    }

    /**
     * Native tag reading (MediaMetadataRetriever) — title/artist/album/genre/year/duration for a
     * batch of documents without downloading the files into the WebView. Artwork is opt-in because
     * it is comparatively expensive; the web layer asks for it only for the track on a deck.
     */
    @PluginMethod
    public void readMetadata(PluginCall call) {
        JSArray uris = call.getArray("uris");
        boolean wantArtwork = Boolean.TRUE.equals(call.getBoolean("artwork", false));
        if (uris == null) {
            call.reject("uris is required");
            return;
        }
        final List<String> list = new ArrayList<>();
        try {
            for (Object o : uris.toList()) if (o != null) list.add(String.valueOf(o));
        } catch (Exception e) {
            call.reject("bad uris", e);
            return;
        }
        getBridge()
            .execute(() -> {
                JSArray out = new JSArray();
                for (String uri : list) {
                    JSObject o = new JSObject();
                    o.put("uri", uri);
                    MediaMetadataRetriever mmr = new MediaMetadataRetriever();
                    try {
                        mmr.setDataSource(getContext(), Uri.parse(uri));
                        putIfPresent(o, "title", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE));
                        putIfPresent(o, "artist", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST));
                        putIfPresent(o, "albumArtist", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUMARTIST));
                        putIfPresent(o, "album", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM));
                        putIfPresent(o, "genre", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE));
                        putIfPresent(o, "year", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR));
                        putIfPresent(o, "date", mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DATE));
                        String durationMs = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                        if (durationMs != null) {
                            try {
                                o.put("durationSec", Long.parseLong(durationMs) / 1000.0);
                            } catch (NumberFormatException ignored) {
                                // provider returned something odd — leave duration unset
                            }
                        }
                        byte[] art = mmr.getEmbeddedPicture();
                        o.put("hasArtwork", art != null);
                        if (art != null && wantArtwork) {
                            o.put("artwork", Base64.encodeToString(art, Base64.NO_WRAP));
                        }
                    } catch (Exception ignored) {
                        // unreadable / unsupported container — the web layer falls back to the filename
                    } finally {
                        try {
                            mmr.release();
                        } catch (Exception ignored) {
                            // nothing to do
                        }
                    }
                    out.put(o);
                }
                JSObject ret = new JSObject();
                ret.put("tracks", out);
                call.resolve(ret);
            });
    }

    /* ------------------------------- internals ------------------------------- */

    private static void putIfPresent(JSObject o, String key, String value) {
        if (value != null && !value.trim().isEmpty()) o.put(key, value.trim());
    }

    private void walk(Uri tree, String documentId, String relativePath, int depth, int maxDepth, int limit, JSArray out) {
        if (depth > maxDepth || out.length() >= limit) return;
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, documentId);
        Deque<String[]> dirs = new ArrayDeque<>(); // [documentId, relativePath]
        try (Cursor c = getContext().getContentResolver().query(children, DOC_PROJECTION, null, null, null)) {
            if (c == null) return;
            // providers are not required to honour the projection order — always look columns up by name
            int iId = c.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int iName = c.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            int iMime = c.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE);
            int iSize = c.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE);
            int iMod = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
            if (iId < 0 || iName < 0) return;
            while (c.moveToNext() && out.length() < limit) {
                String docId = c.getString(iId);
                String name = c.getString(iName);
                String mime = iMime >= 0 && !c.isNull(iMime) ? c.getString(iMime) : null;
                long size = iSize >= 0 && !c.isNull(iSize) ? c.getLong(iSize) : 0;
                long modified = iMod >= 0 && !c.isNull(iMod) ? c.getLong(iMod) : 0;
                if (docId == null || name == null) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    dirs.add(new String[] { docId, relativePath.isEmpty() ? name : relativePath + "/" + name });
                    continue;
                }
                if (!isAudio(name, mime)) continue;
                JSObject o = new JSObject();
                o.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, docId).toString());
                o.put("name", name);
                o.put("size", size);
                o.put("lastModified", modified);
                o.put("mimeType", mime);
                o.put("relativePath", relativePath);
                out.put(o);
            }
        } catch (Exception ignored) {
            // unreadable subtree — skip it rather than failing the whole scan
        }
        for (String[] dir : dirs) walk(tree, dir[0], dir[1], depth + 1, maxDepth, limit, out);
    }

    private JSObject documentInfo(Uri uri, String relativePath) {
        String name = null;
        long size = 0;
        long modified = 0;
        String mime = getContext().getContentResolver().getType(uri);
        try (Cursor c = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int iName = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int iSize = c.getColumnIndex(OpenableColumns.SIZE);
                int iMod = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
                if (iName >= 0 && !c.isNull(iName)) name = c.getString(iName);
                if (iSize >= 0 && !c.isNull(iSize)) size = c.getLong(iSize);
                if (iMod >= 0 && !c.isNull(iMod)) modified = c.getLong(iMod);
            }
        } catch (Exception ignored) {
            // fall through with what we have
        }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null || !isAudio(name, mime)) return null;
        JSObject o = new JSObject();
        o.put("uri", uri.toString());
        o.put("name", name);
        o.put("size", size);
        o.put("lastModified", modified);
        o.put("mimeType", mime);
        o.put("relativePath", relativePath);
        return o;
    }

    private String treeDisplayName(Uri tree) {
        try (Cursor c = getContext()
            .getContentResolver()
            .query(
                DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree)),
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                null,
                null,
                null
            )) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignored) {
            // fall back to the document id below
        }
        String id = DocumentsContract.getTreeDocumentId(tree);
        int colon = id.lastIndexOf(':');
        String tail = colon >= 0 ? id.substring(colon + 1) : id;
        return tail.isEmpty() ? "Folder" : tail;
    }

    /** A persisted grant on a tree also covers every document built from that tree. */
    private boolean isPermitted(String uri) {
        for (UriPermission p : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (!p.isReadPermission()) continue;
            String held = p.getUri().toString();
            if (uri.equals(held) || uri.startsWith(held + "/document/")) return true;
        }
        return false;
    }

    private static boolean isAudio(String name, String mime) {
        if (mime != null && mime.startsWith("audio/")) return true;
        String lower = name == null ? "" : name.toLowerCase(Locale.US);
        for (String ext : AUDIO_EXTENSIONS) if (lower.endsWith(ext)) return true;
        return false;
    }
}
