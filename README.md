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

## Start here

Read **[docs/design/design_handoff_qwk_mobile/PHASE8-KICKOFF.md](docs/design/design_handoff_qwk_mobile/PHASE8-KICKOFF.md)**
first — it contains:

- the **Phase 7 API contract** the app talks to (endpoints, bearer-token auth,
  TLS fingerprint pinning, retry-safe/idempotent upload, `204`/`wrongBBS`
  semantics, and how to enable `qwkAPI` on a test BBS);
- the **design source** — `docs/design/design_handoff_qwk_mobile/README.md`
  (design tokens, typography, per-screen notes) + the HTML prototype and 15
  screenshots covering the full offline loop.

Then kick off with the superpowers **brainstorming → writing-plans →
subagent-driven-development** flow, decomposing the app into sub-projects (app
shell + navigation, connect/auth, sync/download, offline store + reader,
compose/outbox/upload, settings/boards/storage). Do **not** spec the whole app
at once.

## Status

Greenfield — the tech stack (RN navigation/styling libraries, offline store,
whether to embed a QWK engine or wrap a reader core) is decided during
brainstorming. Nothing is built yet.
