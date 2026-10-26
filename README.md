# ViSiON/3 QWK Mobile

A **React Native** offline-mail client for the [ViSiON/3 BBS](https://github.com/ViSiON-3/vision-3-bbs).
It lets a BBS user log in, download a `.QWK` packet, read and reply to messages
**entirely offline**, then upload a `.REP` packet of replies and see an import
report. Packet-oriented by design — no live message browsing, no terminal
scraping.

This is **Phase 8** of the ViSiON/3 QWK roadmap. Phases 0–7 (the packet engine
and the server-side [QWK Packet API](https://github.com/ViSiON-3/vision-3-bbs/blob/main/docs/sysop/messages/qwk-api.md))
ship in the `vision-3-bbs` repo; this repo is the mobile client that consumes
that API.

## Status

The full offline loop is implemented: **connect → sync → read → compose/reply →
upload → import report**. Built across six merged PRs:

1. **Foundation** — QWK/REP packet engine, app shell + navigation, offline
   store, API client core.
2. **Live sync** — server-driven conference/area taxonomy from `CONTROL.DAT`,
   reply threading (`reference` + HEADERS.DAT `In-Reply-To`).
3. **BBSID adoption** — the board adopts the server's real BBSID from the
   synced packet so `.REP` uploads route correctly.
4. **TLS trust-on-first-use** — SHA-256 fingerprint capture + pinned transport
   for the API's self-signed default cert (real CA certs also supported).
5. **Streamed downloads** — packets stream straight to disk through the native
   transport with real byte-level progress.
6. **Message editor** — compose/reply with Private/Quote pre-prompts,
   Save/Kill/Edit flow, New Message into any area (including private mail),
   inline saved-reply editing in the reader, and a pack-time
   **sanitize → 79-col wrap → tag-line** pipeline so modern-keyboard Unicode
   never corrupts classic boards. `.REP` output is deterministic, so retried
   uploads are idempotent (the server de-dupes).

### What's where

- `src/qwk/` — pure, Node-testable packet engine: QWK reader, REP writer,
  CP437/UTF-8 handling, HEADERS.DAT, NDX, plus the editor text pipeline
  (`sanitize`, `wrap`, `quote`, `tagline`). Format notes in
  [docs/qwk/FORMAT.md](docs/qwk/FORMAT.md).
- `src/api/` — QWK Packet API client, bearer-token session, pinned fetch,
  TOFU fingerprint capture.
- `src/store/` — Zustand app state, AsyncStorage persistence (passwords in the
  OS keychain), packet byte cache, board-scoped outbox drafts, `.REP` builder.
- `src/screens/`, `src/navigation/`, `src/components/`, `src/theme/` — the
  15-screen UI recreating the high-fidelity design handoff (CRT styling, VGA
  font).
- `modules/qwk-tls/` — native TLS-pinning + streaming-download module
  (**iOS only so far**). Where the native module is absent (Android, Expo Go),
  pinned boards fail with a clear "needs a development build" error; boards
  without a pinned fingerprint use the platform fetch.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — the design specs
  and implementation plans each feature was built from.

### Known gaps / next up

- **Android parity** for the native TLS-pinning/streaming module.
- **On-device pass**: the native Save/Kill/Edit prompt and autocorrect
  injection need a real device or simulator (`Alert` is a no-op on web).
- **Quote format confirmation**: the attribution wording and initials rule in
  `src/qwk/quote.ts` are marked PROVISIONAL pending confirmation against
  `vision-3-bbs`.
- **Live-instance round trip** against a ViSiON/3 board with
  `qwkAPI.enabled=true`, including interrupted downloads and duplicate uploads.
- Future editor features (per spec): edit subject/To on replies, CP437 char
  picker, color selection, auto-signature, tag-line library, bulletin/news
  display.

## Development

```bash
npm install
npm test            # 153 Jest tests (packet engine, store, API — Node env)
npm run typecheck   # tsc --noEmit
npm start           # Expo dev server (iOS/Android via Expo Go or dev build)
npm run web         # browser-run for quick manual passes (see note)
```

**Web note:** `expo start --web` is a dev/debug affordance — packet bytes live
in memory for the session (expo-file-system has no web support) and the native
Save/Kill/Edit `Alert` doesn't fire. Verify those flows on a device.

**Demo mode** (Settings → demo) exercises the full loop against a generated
sample packet with no server: sync imports a sample `.QWK`, upload compiles and
"imports" your real drafts.

## Early adopters / testers

This is pre-release software. There is no App Store or Play Store listing, no
TestFlight, and no prebuilt binaries: **to run it you build and install it
yourself.** Building and deploying a React Native app is outside the scope of
this repo — the Expo docs cover it well, and we can't troubleshoot your
toolchain. Pointers to get you going:

- You need a **development build**, not Expo Go, because of the native
  TLS-pinning module. See
  [Expo: create a development build](https://docs.expo.dev/develop/development-builds/create-a-build/).
- `app.json` carries the upstream `bundleIdentifier`, `appleTeamId` and EAS
  `projectId`. **Replace them with your own** (or delete the last two) before
  building, or signing will fail. `eas init` sets up your own EAS project.
- Local: `npx expo prebuild` generates the gitignored `ios/` and `android/`
  projects, then `npx expo run:ios --device` / `npx expo run:android`.
- Cloud: `eas.json` has `development`, `preview` and `production` profiles
  for [EAS Build](https://docs.expo.dev/build/introduction/).
- **Android is behind**: the native TLS-pinning module is iOS-only so far, so
  on Android only boards with a real CA-signed cert will connect.
- You need a ViSiON/3 board running with `qwkAPI.enabled=true` (see the
  [server docs](https://github.com/ViSiON-3/vision-3-bbs/blob/main/docs/sysop/messages/qwk-api.md)),
  or flip **Settings → demo** to exercise the loop against a sample packet.

Bug reports and PRs are welcome; please include device, OS version and whether
the board uses a pinned (self-signed) or CA cert.

## Start here (contributors)

Read **[docs/design/design_handoff_qwk_mobile/PHASE8-KICKOFF.md](docs/design/design_handoff_qwk_mobile/PHASE8-KICKOFF.md)**
first — it contains:

- the **Phase 7 API contract** the app talks to (endpoints, bearer-token auth,
  TLS fingerprint pinning, retry-safe/idempotent upload, `204`/`wrongBBS`
  semantics, and how to enable `qwkAPI` on a test BBS);
- the **design source** — `docs/design/design_handoff_qwk_mobile/README.md`
  (design tokens, typography, per-screen notes) + the HTML prototype and 15
  screenshots covering the full offline loop.

New features follow the superpowers **brainstorming → writing-plans →
subagent-driven-development** flow: each sub-project gets its own spec in
`docs/superpowers/specs/` and plan in `docs/superpowers/plans/` before
implementation. Branch per change; PRs for review.

## License

MIT — see [LICENSE](LICENSE). The bundled IBM VGA font is CC BY-SA 4.0; see
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
