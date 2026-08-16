# DJKado — pro DJ mixing in your browser

[![CI](https://github.com/koneb71/djkado/actions/workflows/ci.yml/badge.svg)](https://github.com/koneb71/djkado/actions/workflows/ci.yml) [![Release](https://img.shields.io/github/v/release/koneb71/djkado?include_prereleases)](https://github.com/koneb71/djkado/releases) [![License: MIT](https://img.shields.io/badge/license-MIT-22d3ee.svg)](LICENSE)

A VirtualDJ-style DJ app built with Vite + React 19 + TypeScript, Tailwind v4, Motion (Framer Motion), Zustand and the Web Audio API. Two or four decks, real-time colored waveforms, BPM / key / beat-grid analysis, sync, loops, hot cues, slip, 3-band EQ + filter, an FX rack, sampler, recording, MIDI learn, keyboard shortcuts — with a hybrid engine designed for local files **and** streaming services.

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
| **Decks** (2 ↔ 4, animated morph) | Jog wheels (vinyl scratch + pitch bend, inertia), scrolling & overview waveforms (zoom, drag-scrub, beat/bar grid, cue & loop markers), CUE / Play / Sync (tempo + continuous phase lock) / Key lock / Slip / Quantize / Censor / Brake / Backspin, pitch fader (±8/16/50 %), 8 hot cues, auto-loop 1/32–64 beats, loop in/out/reloop, beat jump, key shift ± semitones |
| **Analysis** (Web Worker pool) | Onset-based BPM (±0.3 BPM), beat phase (±15 ms), key (Krumhansl + EDMA profiles → Camelot), 3-band waveform, auto-gain — cached in IndexedDB |
| **Mixer** | Gain, 3-band EQ with full kill, dual LP/HP filter, faders with VU meters, headphone cue + cue-mix, crossfader (linear / power / cut) with A/B/thru assignment, master limiter + meters |
| **FX** | 3 insert slots per deck: Echo, Reverb, Flanger, Phaser, Bitcrusher (AudioWorklet), Filter LFO, Gate — beat-synced to the deck's tempo |
| **Sampler** | 2 banks × 8 pads (one-shot / hold / loop), synthesized starter kit, load your own samples by click or drop |
| **Recording** | Master mix to WebM/Opus (or WAV) with one click |
| **Control** | VirtualDJ-like keyboard map (press `?`), Web MIDI with learn mode, LED feedback hooks |
| **Library** | Local files & folders (File System Access API, tags + artwork via music-metadata), History, key-compatible track highlighting, virtualized table, drag-to-deck |
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

## Keyboard (press `?` in the app)

`Q/W` play A/B · `A/S` cue · `Z/X` sync · `1-4` / `7-0` hot cues · `E/O` loop · `R/T` `U/I` loop ½/×2 · `D/F` `J/K` bend · `C/V` censor · `G/H` slip · `↑/↓` browse · `Shift+←/→` load to A/B · `Enter` load to focused deck · `Space` play focused · `L` library · `N` 2/4 decks · `M` sampler · `F1–F8` sampler pads · `Shift+B` record. Shift-drag knobs for fine control, double-click to reset, scroll the waveform to zoom.

---

## Project layout

```
electron/                  Electron main (embedded server, menu, updater, permissions), preload bridge, config, window state
server/                    Hono API (app.ts shared with the desktop app): health, Apple developer token, preview proxy, static renderer
src/audio/engine/          AudioEngine (singleton), MasterBus, ChannelStrip, Crossfader, Deck, Sampler, Recorder
src/audio/backends/        DeckBackend contract, WebAudioBackend (worklet), MockStreamBackend
src/audio/worklets/        deck-player (variable-rate player), bitcrusher; deck-player-core is pure & unit-tested
src/audio/dsp/             fft, biquad, onset, bpm, beatgrid, key, waveform, gain (+ tests)
src/audio/workers/         analysis worker (comlink) + priority queue with IndexedDB cache
src/audio/fx/              FxUnit base + Echo/Reverb/Flanger/Phaser/Bitcrusher/FilterLFO/Gate, FxChain
src/audio/midi|keyboard/   action registry shared by MIDI learn + keyboard map
src/services/sources/      MusicSource interface, mock Spotify/Apple, registry with feature flags
src/services/spotify|appleMusic/  real adapters (PKCE, Web API, MusicKit loader) activated by env
src/services/localLibrary/ File System Access, tags, IndexedDB schema (analysis, cues, handles, history)
src/store/                 Zustand (decks, mixer, library, ui, fx) + runtime.ts (high-frequency channels for canvases)
src/components/            deck, waveform, jog, mixer, fx, sampler, browser, settings, overlays, layout
src/desktop/               renderer-side desktop glue (bridge, menu actions, hooks)
src/ui/                    Knob, Fader, Button, Led, Panel, Tooltip, Toggle, tokens.css, motion presets
```

Performance rule: anything faster than ~10 Hz (playheads, meters, platter rotation) bypasses React — the engine writes to `store/runtime.ts` channels and canvases/MotionValues read them in one shared `requestAnimationFrame` loop.

## Browser support

Chrome / Edge give the full experience (AudioWorklet, File System Access, Web MIDI, `setSinkId`). Firefox and Safari run the engine; MIDI, folder persistence and output-device switching degrade gracefully. Key lock uses [signalsmith-stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT, vendored in `public/vendor`).

## Scripts

`pnpm dev` · `pnpm dev:web` · `pnpm dev:api` · `pnpm build` · `pnpm preview` · `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm dev:desktop` · `pnpm build:desktop` · `pnpm dist:mac` · `pnpm dist:win` · `pnpm dist` · `pnpm release` · `pnpm icons` (regenerate `build/icon.png`) · `node scripts/gen-demo.mjs` (regenerate demo clips) · `node scripts/vendor.mjs` (re-vendor the stretch lib after upgrading it)

## Contributing & license

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Releases are built by GitHub Actions on `v*` tags. DJKado is open source under the [MIT License](LICENSE). Bundled: [signalsmith-stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT). DJKado is not affiliated with Spotify, Apple or VirtualDJ; use your own developer credentials and respect each service's terms.
