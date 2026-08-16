# Contributing to DJKado

Thanks for helping! DJKado is MIT-licensed; contributions are welcome via pull requests.

## Setup
```bash
pnpm install
pnpm dev            # web app on http://127.0.0.1:5173 (+ API on :8787)
pnpm dev:desktop    # Electron
pnpm test && pnpm lint && pnpm typecheck
```

## Ground rules
- Keep the audio engine deterministic and testable: DSP lives in `src/audio/dsp` (pure TS, unit-tested with Vitest); anything > 10 Hz goes through `src/store/runtime.ts`, not React state.
- Never route DRM audio (Spotify SDK / MusicKit full tracks) into the Web Audio graph — the `DeckBackend` contract is the seam.
- Run `pnpm lint` and `pnpm test` before opening a PR; add tests for DSP changes (synthetic fixtures live in `src/audio/dsp/__tests__/synth.ts`).
- Streaming adapters must keep working in **mock mode** with no credentials.

## Releasing
Bump `version` in `package.json`, tag `vX.Y.Z` and push the tag — the *Release desktop apps* workflow builds and publishes macOS/Windows installers to GitHub Releases (auto-update feed).
