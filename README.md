# DJKado — pro DJ mixing in your browser

[![CI](https://github.com/koneb71/djkado/actions/workflows/ci.yml/badge.svg)](https://github.com/koneb71/djkado/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/koneb71/djkado?include_prereleases)](https://github.com/koneb71/djkado/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-22d3ee.svg)](LICENSE)

A VirtualDJ-style DJ app for the browser, desktop (macOS/Windows) and Android, built with Vite + React 19 + TypeScript, Tailwind v4, Motion (Framer Motion), Zustand and the Web Audio API. Two or four decks, real-time colored waveforms, BPM / key / beat-grid analysis, sync, loops, hot cues, slip, 3-band EQ + filter, an FX rack, sampler, recording, MIDI learn, keyboard shortcuts — with a hybrid engine designed for local files **and** streaming services.

```bash
pnpm install
pnpm dev          # web on http://127.0.0.1:5173  +  API on :8787
pnpm test         # vitest (DSP, beat-grid, player core, crossfader …)
pnpm build        # type-check + production build → dist/
```

Open **http://127.0.0.1:5173**, click once to power on the audio engine, then drop audio files (or folders) anywhere — or use *Add files* / *Add folder* in the library. Double-click a track (or press the A/B buttons, or drag it onto a deck) to load it.

> Use `127.0.0.1`, not `localhost` — Spotify's OAuth only allows the loopback IP for http redirect URIs.

---

## What's inside

| Area | Highlights |
|---|---|
| **Decks** (2 ↔ 4, animated morph) | Jog wheels (vinyl scratch + pitch bend, inertia), scrolling & overview waveforms (zoom, drag-scrub, beat/bar grid, cue & loop markers), CUE / Play / Sync (tempo + continuous phase lock) / Key lock / Slip / Quantize / Censor / Brake / Backspin, pitch fader (±8/16/50 %), **performance pads** (8 hot cues · loop roll 1/16–8 · 8-slice slicer with slip · beat jump ±1–16), auto-loop 1/32–64 beats, loop in/out/reloop, key shift ± semitones |
| **Analysis** (Web Worker pool) | Onset-based BPM (±0.3 BPM), beat phase (±15 ms), key (Krumhansl + EDMA profiles → Camelot), 3-band waveform, auto-gain — cached in IndexedDB |
| **Mixer** | Gain, 3-band EQ with full kill, dual LP/HP filter, faders with VU meters, crossfader (linear / power / cut) with A/B/thru assignment, master limiter + meters |
| **Headphone cue** | Real PFL on a **second audio output** (`AudioContext.setSinkId` — USB card / Bluetooth headphones), cue-mix + phones volume, split cue (L = cue, R = master), library **pre-listen** button per track; falls back to blending the cue into the master when no headphone output is set |
| **FX** | 3 insert slots per deck: Echo, Reverb, Flanger, Phaser, Bitcrusher (AudioWorklet), Filter LFO, Gate — beat-synced to the deck's tempo |
| **Sampler** | 2 banks × 8 pads (one-shot / hold / loop), synthesized starter kit, load your own samples by click or drop |
| **Stems** | On-device 4-stem separation (vocals / drums / bass / other) with HTDemucs on WebGPU — per-deck stem faders, mute/solo, Acapella / Instrumental / Drumless presets, sample-accurate mixing in the deck worklet, cached in IndexedDB |
| **Recording** | Master mix to WebM/Opus (or WAV) with one click |
| **Control** | VirtualDJ-like keyboard map (press `?`), Web MIDI with learn mode, LED feedback hooks |
| **Library** | Local files & folders (File System Access API on desktop, Android Storage Access Framework on the phone — both remembered between launches; tags + artwork via music-metadata / MediaMetadataRetriever), **browse by folder** (tree sidebar on desktop, drill-down on phones, with queue-folder / crate-from-folder actions), History, **crates** (playlists, drag-to-crate, rename/delete), **play queue** (reorder, play-next, shuffle), row context menu, key-compatible track highlighting, virtualized table, drag-to-deck |
| **Auto DJ** | Plays the queue on decks A/B: preloads the next track, tempo-matches + phase-aligns via the sync engine, crossfades over 4/8/16/32 bars with optional bass swap, glides back to the track's own tempo, skips missing files, *Skip* to mix now — works on desktop and phone |
| **Streaming** | Spotify & Apple Music sources with the same browse → load workflow. Ships in **mock mode** (demo catalog) until you add credentials — see below |

### The hybrid engine (why streaming decks are "limited")

Spotify's Web Playback SDK and Apple MusicKit deliver **DRM-protected** audio that browsers won't expose to the Web Audio graph. That means: play / pause / seek / volume only — no scratching, tempo, EQ, FX or beat-sync — and one active stream per service. DJKado handles this honestly:

- `WebAudioBackend` — local files (and Apple Music 30-second **catalog previews**, which are plain AAC) run through the full engine: an `AudioWorklet` player with variable/negative rate, sample-accurate seeks, loops and slip, into the channel strip.
- `Stream` backends — full Spotify / Apple tracks load into a **Stream Deck**: same UI shell, DSP controls dimmed, an amber *STREAM · LIMITED* badge, fader/crossfader mapped to SDK volume.

`src/audio/backends/DeckBackend.ts` is the contract; each `TrackRef` kind picks its backend.

---

## Connecting your accounts (optional)

Both integrations are wired end-to-end but run against **mock sources** until configured. Copy `.env.example` → `.env`.

### Spotify (free developer app + **Premium** for playback)

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add the redirect URI **exactly**: `http://127.0.0.1:5173/callback/spotify`
3. Set `VITE_SPOTIFY_CLIENT_ID=…` in `.env` and restart `pnpm dev`.

Auth is OAuth 2.0 PKCE (no client secret). Note Spotify's terms restrict DJ-style mixing of its content and dev-mode apps are limited to 25 allow-listed users; the app therefore keeps Spotify decks in playback-only mode.

### Apple Music (Apple Developer Program required)

1. In your Apple developer account create a **MusicKit** key (`.p8`), note the Key ID and your Team ID.
2. Set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_PATH` in `.env`.
3. The Hono server (`server/index.ts`) mints the ES256 developer token at `/api/apple/developer-token`; the app then loads MusicKit JS and asks you to authorize.

Full tracks → Stream Deck. Search results also list **30 s previews**, which load into the full engine (waveform, BPM, key, scratch …).

---

## Stems (on-device separation)

Press **STEMS** on a deck → *Prepare stems*. DJKado separates the track into **vocals, drums, bass and other** entirely on your machine using **HTDemucs (Meta's Demucs v4, MIT)** exported to ONNX and run with ONNX Runtime Web:

- **WebGPU** (Chrome / Edge / Electron on macOS & Windows): ~30 s for a 4-minute track. Without WebGPU it falls back to single-threaded WASM (~5 min) — the UI tells you which engine is in use.
- The 180 MB model (`timcsy/demucs-web-onnx/htdemucs_embedded.onnx`) is downloaded from Hugging Face on first use, sha256-verified and cached in the browser (Settings ▸ Stems lets you pre-download or remove it).
- Results are cached in IndexedDB (Int16, ~200 MB per 5-min track, oldest evicted) so a track's stems attach instantly next time; a pink layers icon marks tracks with stems in the library.
- Stems are mixed **inside the deck worklet** at the same fractional playhead as the original, so scratching, loops, slip and sync stay sample-accurate with stems on. Sum of stems ≈ original (measured 39 dB SNR), so "all stems on" is transparent.
- Controls: 4 stem faders, M/S per stem, presets (Acapella, Instrumental, Drumless, Drums only), `Shift+1..4` mute stems on the focused deck, `Shift+P` opens the panel; MIDI-mappable (`deck.stems.*` actions). Auto-prepare on load is optional (Settings ▸ Stems).
- Local files and Apple previews only (DRM streams can't be separated). Storage: keep an eye on Settings ▸ Stems ▸ cache.

---

## Desktop app (macOS & Windows)

DJKado also ships as an **Electron** desktop app — full Chromium parity (Web MIDI controllers, audio-output switching, folder access, key lock, recording), native menus, and the API server embedded in-process.

```bash
pnpm dev:desktop        # Electron + Vite dev server with hot reload
pnpm dist:mac           # → release/DJKado-<ver>-{arm64,x64}.dmg / .zip (+ latest-mac.yml)
pnpm dist:win           # → release/DJKado-Setup-<ver>-x64.exe (NSIS; cross-builds fine from macOS)
pnpm dist               # both
pnpm release            # build + publish installers to GitHub Releases (needs GH_TOKEN)
```

How it works: the packaged app starts the same Hono server as `server/` on **http://127.0.0.1:47831**, serves the built renderer from it (loopback = secure context, so AudioWorklet/MIDI/File System Access all work) and opens it in a `BrowserWindow` (`electron/main.ts`). Menus call renderer actions via `window.djkadoActions` (`src/desktop/actions.ts`); a small preload bridge (`window.desktop`) exposes version, updates, config and dialogs. Window position, `config.json` (Apple credentials, audio buffer size) and `.env` live in the app's data folder (Settings ▸ Desktop ▸ *Open*).

**Installing unsigned builds** (until you add signing certificates):
- macOS: the DMG is unsigned/un-notarized → Gatekeeper warns. Right-click the app ▸ *Open* once, or run `xattr -dr com.apple.quarantine /Applications/DJKado.app`.
- Windows: SmartScreen shows "Windows protected your PC" → *More info* ▸ *Run anyway*.
- Signing turns on automatically when you provide certificates through electron-builder's env vars (`CSC_LINK`/`CSC_KEY_PASSWORD`; macOS notarization: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).

**Auto-update** uses `electron-updater` against GitHub Releases (`koneb71/djkado`, see `electron-builder.yml`). Publish with `GH_TOKEN=… pnpm release`; the app checks 5 s after launch and from Help ▸ *Check for Updates…*. Windows updates work unsigned; macOS auto-update requires a signed build (the app tells you and links to Releases instead).

**Streaming in the desktop app:** stock Electron has no Widevine DRM module, so Spotify Web Playback and Apple Music *full-track* playback cannot run inside the desktop app — browsing, Apple 30 s previews (full engine) and local files all work; use the web app in Chrome for DRM streams. Apple credentials for the desktop app go in Settings ▸ Desktop (Team ID, Key ID, choose the `.p8`) — no `.env` needed. For Spotify, register **both** redirect URIs (`http://127.0.0.1:5173/callback/spotify` and `http://127.0.0.1:47831/callback/spotify`) in the Spotify dashboard.

Building on Apple Silicon: the Windows installer is produced with electron-builder's native NSIS toolset (`toolsets.nsis: 1.2.1`); no Rosetta or Wine needed. Tagging `vX.Y.Z` (matching `package.json`) runs the *Release desktop apps* workflow, which builds macOS + Windows on GitHub runners and publishes the release.

---

## Android app

DJKado runs on Android as a **Capacitor** app (the web app inside a Chromium WebView → AudioWorklet, WASM, IndexedDB all work) with a dedicated **touch / portrait phone layout**: two compact decks (waveform = jog: drag to scrub/scratch), a mini mixer (volume, filter, crossfader), bottom tabs for Library · Mix (EQ / Stems / FX) · Sampler, native status bar & splash, keep-awake while playing, hardware back button, haptics on pads. Landscape shows the two decks side by side; tablets ≥ 1000 px wide get the desktop layout.

```bash
pnpm android:build     # vite build + cap sync + gradle → android/app/build/outputs/apk/debug/app-debug.apk
pnpm android:run       # build and run on a connected device/emulator
pnpm android:open      # open the project in Android Studio
```
Requirements: Android Studio (SDK 35+, JDK 21 — set `JAVA_HOME` to Android Studio's JBR if needed). The Release workflow also builds an APK for every `v*` tag (signed when `ANDROID_KEYSTORE_BASE64` / `_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` secrets are set, debug-signed otherwise) and attaches it to the GitHub release; sideload it with "Install unknown apps" enabled.

Notes: Stems run on the CPU (the WebView has no WebGPU) — expect several minutes per track on a phone; Spotify/Apple Music DRM streams are not available in the WebView.

### Your music, and what the app remembers

Android's WebView has no File System Access API (and no `<input webkitdirectory>`), so **Add folder** goes through a small native plugin (`android/app/src/main/java/com/djkado/app/FilesPlugin.java`) that uses the **Storage Access Framework**: you grant one folder, Android *persists* that grant, and DJKado re-opens the folder on every launch and picks up files you added since. Tags come from `MediaMetadataRetriever` (no file is copied into the WebView), and audio is read as `content://` → `Capacitor.convertFileSrc()` → `https://localhost/_capacitor_content_/…`, same origin as the app. No storage permission is requested — SAF needs none.

Note for contributors: always read those URLs **whole** (`fetch(url).arrayBuffer()`, via `src/services/tracks/bytes.ts`). Capacitor's local server answers a `Range` request with `206` but streams from byte 0, so a ranged read silently returns the wrong audio — never point an `<audio>`/MediaSource at a native track.

However you add music — a picked folder, a drag & drop, or the Android folder grant — DJKado keeps the folder layout: the Local tab shows a folder tree (a breadcrumb + chips on phones) that filters the track list, and each folder can be sent to the queue or turned into a crate in one click. Files added individually sit under *Loose files*.

Persisted across restarts (all platforms): the library, crates + queue, hot cues / beat-grid edits / analysis cache (keyed by `name|size|mtime`, so the same file keeps its data whichever way it was added), the FX rack per deck, sampler pads *and* the samples you loaded, per-deck switches (key lock, quantize, slip, auto-loop size, pitch range), MIDI mappings, master/trim/curve and headphone settings. Deliberately **not** restored: loaded tracks and play state, sync/master, channel faders, EQ, filter and the crossfader — a fader restored at 0 is indistinguishable from a broken app.

In a plain browser, files added with drag & drop or **Add files** cannot be re-opened on the next visit (the File System Access API only persists *folder* handles) — those show up as "needs re-adding" in Settings ▸ Library. Add a folder instead and it comes back by itself.

---

## Deploy to a server (Docker / Dokploy)

DJKado is a static web app plus a tiny API (Apple developer token + preview proxy) — no database, all user data stays in the browser. One container serves both:

```bash
docker build -t djkado .            # multi-stage: pnpm build → dist/, esbuild-bundled server → dist-server/
docker run -p 51732:51732 djkado    # http://localhost:51732  ·  GET /api/health → {"ok":true}
```

Prebuilt images are published by CI to `ghcr.io/koneb71/djkado` (`:latest` = last release, `:edge` = main).

**Dokploy** (either flavour):
1. *Projects → Create Application*. **Provider: GitHub/Git** → repo `koneb71/djkado`, branch `main`, **Build type: Dockerfile** (path `Dockerfile`) — or **Provider: Docker** → image `ghcr.io/koneb71/djkado:latest`.
2. *Environment*: nothing required. Optional: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (paste the .p8 contents) for real Apple Music; Spotify is baked in at build time via build args `VITE_SPOTIFY_CLIENT_ID` / `VITE_SPOTIFY_REDIRECT_URI` (`https://your-domain/callback/spotify`, registered in the Spotify dashboard).
3. *Domains*: add your domain, **container port `51732`**, HTTPS on (Let's Encrypt). A secure origin is required — AudioWorklet, WebGPU stems, `setSinkId` headphone routing and the File System Access API only work over HTTPS (or localhost).
4. Deploy. Health check: `/api/health`. The image runs as a non-root user and needs no volumes.

**Dokploy as a Compose service:** point it at `docker-compose.dokploy.yml` (pulls `ghcr.io/koneb71/djkado:edge` — no build on the server, no host port, joined to `dokploy-network`; set `DJKADO_TAG=latest` for releases), deploy, then add the domain in the service's *Domains* tab (service `djkado`, port `51732`, HTTPS + Let's Encrypt). If Traefik answers 404 / its default certificate, the container isn't running or isn't on `dokploy-network` — check the deploy log first. `docker-compose.yml` is the plain-Docker variant (publishes `${HOST_PORT:-51732}:51732`).

Memory: the container is idle-cheap; heavy work (analysis, stem separation) happens in the visitor's browser.

## Keyboard (press `?` in the app)

`Q/W` play A/B · `A/S` cue · `Z/X` sync · `1-4` / `7-0` hot cues · `E/O` loop · `R/T` `U/I` loop ½/×2 · `D/F` `J/K` bend · `C/V` censor · `G/H` slip · `↑/↓` browse · `Shift+←/→` load to A/B · `Enter` load to focused deck · `Space` play focused · `L` library · `N` 2/4 decks · `M` sampler · `F1–F8` sampler pads · `Shift+B` record · `Tab` cycle pad mode · `Shift+Q` add selected to queue · `Shift+A` Auto DJ on/off · `Shift+S` Auto DJ skip. Shift-drag knobs for fine control, double-click to reset, scroll the waveform to zoom.

---

## Project layout

```
electron/                  Electron main (embedded server, menu, updater, permissions), preload bridge, config, window state
android/                   Capacitor Android project (Gradle; version derives from package.json)
src/mobile/, src/components/mobile/  phone layout (MobileShell/MobileDeck/MobileMixer), Capacitor glue (status bar, keep-awake, back button, haptics)
server/                    Hono API (app.ts shared with the desktop app): health, Apple developer token, preview proxy, static renderer
src/audio/engine/          AudioEngine (singleton), MasterBus (+ headphone/cue section), ChannelStrip, Crossfader, Deck, Sampler, Recorder, Automix, Prelisten
src/audio/backends/        DeckBackend contract, WebAudioBackend (worklet), MockStreamBackend
src/audio/worklets/        deck-player (variable-rate player), bitcrusher; deck-player-core is pure & unit-tested
src/audio/dsp/             fft, biquad, onset, bpm, beatgrid, key, waveform, gain (+ tests)
src/audio/workers/         analysis worker (comlink) + priority queue with IndexedDB cache
src/audio/fx/              FxUnit base + Echo/Reverb/Flanger/Phaser/Bitcrusher/FilterLFO/Gate, FxChain
src/audio/stems/           HTDemucs pipeline (stft, segmenting), ONNX Runtime Web worker (WebGPU/WASM), model cache, StemsQueue + IndexedDB cache
src/audio/midi|keyboard/   action registry shared by MIDI learn + keyboard map
src/services/sources/      MusicSource interface, mock Spotify/Apple, registry with feature flags
src/services/spotify|appleMusic/  real adapters (PKCE, Web API, MusicKit loader) activated by env
src/services/localLibrary/ File System Access, tags, IndexedDB schema (analysis, cues, handles, history)
src/store/                 Zustand (decks, mixer, library, crates/queue, automix, ui, fx, stems) + runtime.ts (high-frequency channels for canvases)
src/components/            deck, waveform, jog, mixer, fx, sampler, browser, settings, overlays, layout
src/desktop/               renderer-side desktop glue (bridge, menu actions, hooks)
src/ui/                    Knob, Fader, Button, Led, Panel, Tooltip, Toggle, tokens.css, motion presets
```

Performance rule: anything faster than ~10 Hz (playheads, meters, platter rotation) bypasses React — the engine writes to `store/runtime.ts` channels and canvases/MotionValues read them in one shared `requestAnimationFrame` loop.

## Browser support

Chrome / Edge give the full experience (AudioWorklet, File System Access, Web MIDI, `setSinkId`). Firefox and Safari run the engine; MIDI, folder persistence and output-device switching degrade gracefully. Key lock uses [signalsmith-stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT, vendored in `public/vendor`).

## Scripts

`pnpm dev` · `pnpm dev:web` · `pnpm dev:api` · `pnpm build` · `pnpm build:server` + `pnpm start` (production: static + API on :8787) · `pnpm preview` · `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm dev:desktop` · `pnpm build:desktop` · `pnpm dist:mac` · `pnpm dist:win` · `pnpm dist` · `pnpm release` · `pnpm icons` (regenerate `build/icon.png`) · `node scripts/gen-demo.mjs` (regenerate demo clips) · `node scripts/vendor.mjs` (re-vendor the stretch lib after upgrading it)

## Contributing & license

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Releases are built by GitHub Actions on `v*` tags. DJKado is open source under the [MIT License](LICENSE). Bundled: [signalsmith-stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT). DJKado is not affiliated with Spotify, Apple or VirtualDJ; use your own developer credentials and respect each service's terms.
