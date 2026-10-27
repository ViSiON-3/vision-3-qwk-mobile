# ViSiON/3 QWK Mobile — Development Guidelines

## What this is

A React Native offline QWK/REP mail client for the ViSiON/3 BBS — **Phase 8** of
the QWK roadmap. It is a thin client over the server-side **QWK Packet API**
(Phase 7, in the `vision-3-bbs` repo). The only BBS logic on the device is
QWK/REP packet parsing/writing; everything else (message storage, threading
rules, ACS) lives on the server.

## Before starting any work

1. **Read `docs/design/design_handoff_qwk_mobile/PHASE8-KICKOFF.md`** — it holds
   the Phase 7 API contract (the cross-repo interface) and the design source.
   Everything the app talks to is defined there.
2. Read the design handoff `docs/design/design_handoff_qwk_mobile/README.md` and
   the `screenshots/` — the UI is **high-fidelity** and intentional; recreate it
   closely with React Native primitives. Do **not** port the `.dc.html` /
   `support.js` prototype runtime.
3. Use the superpowers **brainstorming → writing-plans →
   subagent-driven-development** flow. Decompose into sub-projects; each gets its
   own spec → plan → implementation cycle.

## Core principles

- **Packet-oriented, offline-first.** No live browsing, no terminal scraping, no
  composition outside REP import. Everything the user reads/writes happens
  against a locally cached packet.
- **Idempotent, retry-safe sync.** Downloads can be interrupted and uploads can
  be retried; the server de-duplicates REP uploads. Design the outbox so
  re-uploading the same `.REP` is safe, and treat a download as committed only
  once the bytes are fully received (the server advances newscan pointers on
  produce).
- **Never store the password.** It is typed once to pair the phone (a P-256 key
  in the Secure Enclave / Android Keystore registered with the BBS); every later
  login signs a server challenge with that key. See
  `docs/superpowers/specs/2026-10-27-device-pairing-design.md`.
- **Pin the server's TLS fingerprint** (trust-on-first-use / sysop-entered), like
  an SSH host key — the API's default cert is self-signed. Support a real cert too.
- **Simplicity & focus.** Match the design; don't reinvent BBS logic. Keep
  components small and testable. Prefer the project's chosen navigation/styling
  libraries once selected in brainstorming.

## Testing

- Unit-test the QWK/REP parsing/writing and the offline store thoroughly (these
  are the correctness-critical parts).
- Validate the full offline round trip against a real ViSiON/3 instance with
  `qwkAPI.enabled=true`, and cover mobile failure cases: interrupted downloads,
  duplicate uploads, stale packet state.

## Version control

- Branch per change; clear, atomic commits; open PRs for review.
- Keep the working tree clean; no secrets committed.
