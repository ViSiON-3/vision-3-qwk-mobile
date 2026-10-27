import { create } from 'zustand';
import { Board, BoardPairing, Conference, Draft, ImportReport, Message, Packet, Settings } from './types';
import { mockBoards } from './mockData';
import {
  buildTaxonomy,
  currentDirectory,
  areasForConference,
  AreaConfig,
  PacketDirectory,
  PRIVATE_CONFERENCE,
} from './taxonomy';
import { buildSampleQwk } from './sampleQwk';
import { parsePacket } from './viewModel';
import { buildRepFromDrafts } from './repBuilder';
import { currentTagline } from './appTagline';
import { makeClient, makeSession, boardSigner, pushDrafts, describeSyncError, needsRepair } from './net';
import { draftsForBoard, migrateDraftBoardIds } from './draftSelectors';
import { QwkSession, DownloadToFileResult, pairDevice } from '../api';
import { readQwkPacket } from '../qwk';
import {
  writePacketBytes,
  readPacketBytes,
  deletePacketBytes,
  clearAllPacketBytes,
  packetFilePath,
} from '../storage/packetCache';
import { loadPersistedState, savePersistedState, PersistedState } from '../storage/persistence';
import { purgeLegacyBoardPassword } from '../storage/secrets';
import { defaultDeviceName } from '../utils/defaultDeviceName';

let idSeq = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(++idSeq).toString(36)}`;

/** Derive a BBS id from a board name: uppercased alphanumerics, <= 8 chars. */
export function deriveBbsId(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BBS';
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DEFAULT_SETTINGS: Settings = { platform: 'ios', scanlines: true, glow: true, demoMode: true };

/**
 * The live API session for the active board. Held outside the reactive store
 * (not serialized, carries the in-memory token across connect/sync/upload).
 */
let activeSession: QwkSession | null = null;

/** Drop the live session, telling the server (best-effort) so the token dies now. */
function endSession() {
  const s = activeSession;
  activeSession = null;
  void s?.logout();
}

/** The live session, for screens that talk to the API directly (Devices). */
export function getActiveSession(): QwkSession | null {
  return activeSession;
}

export interface AppState {
  hydrated: boolean;

  boards: Board[];
  activeBoardId: string;

  loggedIn: boolean;
  connecting: boolean;
  /** True during the pair step of connect (password login + key registration). */
  pairing: boolean;
  /** Last connect/sync/upload failure, user-facing; null when clear. */
  error: string | null;

  syncing: boolean;
  /**
   * Download progress 0..1 while streaming a packet with a known size. null when
   * not downloading, on the non-streaming fallback, or when the total size is
   * unknown (indeterminate) — SyncScreen then shows its reveal-cadence animation.
   */
  downloadProgress: number | null;
  lastPacket: Packet | null;
  /** Outcome of the most recent sync: a packet arrived, or the board had no new
   * mail (server 204). null before the first sync or after a failed one. */
  lastSyncResult: 'packet' | 'none' | null;

  /** Messages parsed from the active board's cached packets. */
  messages: Message[];
  /** Conference/area taxonomy for the active board, built from CONTROL.DAT. */
  conferences: Conference[];
  areas: AreaConfig[];
  readIds: Set<string>;

  drafts: Draft[];
  uploading: boolean;
  report: ImportReport | null;

  packets: Packet[];
  settings: Settings;

  // lifecycle
  hydrate: () => Promise<void>;

  // session
  /**
   * Dial in. A paired board logs in with its device key. An unpaired board
   * needs the password once: it pairs this phone (registering a fresh hardware
   * key), then logs in. The password is used for that one request and dropped.
   */
  connect: (password?: string) => void;
  disconnect: () => void;
  /** Forget a board's pairing + device key (after unpairing it on the server,
   * or to force a re-pair). Logs out if it is the active board. */
  forgetPairing: (boardId: string) => Promise<void>;
  syncNow: () => void;
  markRead: (id: string) => void;
  clearError: () => void;

  // boards
  selectBoard: (id: string) => { disconnected: boolean };
  addBoard: (input: Omit<Board, 'id' | 'bbsId' | 'pairing'>) => void;
  /** Edit a board. Changing host, port or handle drops its pairing: the key was
   * registered for one account on one server. Returns whether it was dropped. */
  updateBoard: (id: string, input: Omit<Board, 'id' | 'bbsId' | 'pairing'>) => { unpaired: boolean };
  deleteBoard: (id: string) => boolean;

  // outbox
  addDraft: (draft: Omit<Draft, 'id'>) => void;
  updateDraft: (id: string, patch: Partial<Omit<Draft, 'id'>>) => void;
  removeDraft: (id: string) => void;
  uploadRep: () => void;
  clearReport: () => void;

  // storage
  deletePacket: (id: string) => void;
  clearPackets: () => void;

  // settings
  setPlatform: (p: Settings['platform']) => void;
  toggleScanlines: () => void;
  toggleGlow: () => void;
  toggleDemoMode: () => void;
}

function snapshot(s: AppState): PersistedState {
  return {
    boards: s.boards,
    activeBoardId: s.activeBoardId,
    settings: s.settings,
    drafts: s.drafts,
    packets: s.packets,
    readIds: [...s.readIds],
  };
}

export const useStore = create<AppState>((set, get) => {
  const persist = () => void savePersistedState(snapshot(get()));

  const activeBoardOf = (): Board | undefined => get().boards.find((b) => b.id === get().activeBoardId);

  const setPairing = (boardId: string, pairing: BoardPairing | undefined) =>
    set((s) => ({ boards: s.boards.map((b) => (b.id === boardId ? { ...b, pairing } : b)) }));

  /** Drop a board's pairing and its hardware key. */
  const dropPairing = async (board: Board) => {
    setPairing(board.id, undefined);
    persist();
    await boardSigner(board).delete();
  };

  /**
   * Shared failure path for connect/sync/upload. An error that says "this
   * phone must pair again" (unpaired on the server, password changed, key gone)
   * drops the pairing and the session, so Connect asks for the password.
   */
  const failWith = (board: Board, e: unknown, extra: Partial<AppState> = {}) => {
    const message = describeSyncError(e);
    if (needsRepair(e)) {
      endSession();
      void dropPairing(board);
      set({ loggedIn: false, error: message, ...extra });
      return;
    }
    set({ error: message, ...extra });
  };

  /** Re-parse the active board's cached packets into state.messages and rebuild
   * the conference/area taxonomy. The newest packet with a V3AREAS.JSON sidecar
   * defines the current area set (see {@link currentDirectory}); without one,
   * the union of every packet's CONTROL.DAT does. */
  const reloadMessages = async () => {
    const board = activeBoardOf();
    if (!board) return set({ messages: [], conferences: [], areas: [] });
    const boardId = board.id;
    const bbsId = board.bbsId;
    const byId = new Map<string, Message>();
    const directories: PacketDirectory[] = []; // newest-first, like packets
    for (const p of get().packets.filter((pk) => pk.bbsId === bbsId)) {
      const bytes = await readPacketBytes(p.id);
      if (!bytes) continue;
      const { messages, qwkConferences, areaIndex } = parsePacket(bytes, bbsId);
      directories.push({ qwkConferences, areaIndex });
      // Packets are stored newest-first, so keep the first (newest) copy of each
      // stable id — an older cached packet must not clobber newer metadata.
      for (const m of messages) if (!byId.has(m.id)) byId.set(m.id, m);
    }
    // Bail if the active board changed while we awaited reads — a stale reload
    // must not overwrite the current board's messages/taxonomy.
    if (get().activeBoardId !== boardId) return;
    const dir = currentDirectory(directories);
    const { conferences, areas } = buildTaxonomy(dir.qwkConferences, dir.areaIndex);
    set({ messages: [...byId.values()], conferences, areas });
  };

  /** Build + cache a sample .QWK for the active board (stands in for download). */
  const importSamplePacket = async () => {
    const board = activeBoardOf();
    if (!board) return;
    const bytes = buildSampleQwk(board.bbsId);
    const id = nextId('pkt');
    writePacketBytes(id, bytes);
    const parsed = readQwkPacket(bytes);
    const tax = buildTaxonomy(parsed.control.conferences, parsed.areaIndex);
    const meta: Packet = {
      id,
      bbsId: board.bbsId,
      file: `${board.bbsId}.QWK`,
      msgs: parsed.messages.length,
      confs: tax.conferences.length,
      areas: tax.areas.length,
      kb: Math.max(1, Math.round(bytes.length / 1024)),
      date: stamp(),
      sample: true,
    };
    set((s) => ({ packets: [meta, ...s.packets], lastPacket: meta }));
    await reloadMessages();
    persist();
  };

  return {
    hydrated: false,

    boards: mockBoards,
    activeBoardId: mockBoards[0].id,

    loggedIn: false,
    connecting: false,
    pairing: false,
    error: null,

    syncing: false,
    downloadProgress: null,
    lastPacket: null,
    lastSyncResult: null,

    messages: [],
    conferences: [],
    areas: [],
    readIds: new Set<string>(),

    drafts: [],
    uploading: false,
    report: null,

    packets: [],
    settings: DEFAULT_SETTINGS,

    hydrate: async () => {
      const persisted = await loadPersistedState();
      if (persisted) {
        const boards: Board[] = persisted.boards.length ? persisted.boards : mockBoards;
        // Pre-pairing builds kept each board's password in the keychain. The app
        // never uses a stored password any more — remove them.
        for (const b of boards) void purgeLegacyBoardPassword(b.id);
        const activeBoardId = persisted.activeBoardId || mockBoards[0].id;
        set({
          boards,
          activeBoardId,
          settings: { ...DEFAULT_SETTINGS, ...persisted.settings },
          // Drafts persisted before boardId existed adopt the active board.
          drafts: migrateDraftBoardIds(persisted.drafts ?? [], activeBoardId),
          packets: persisted.packets ?? [],
          readIds: new Set(persisted.readIds ?? []),
        });
        await reloadMessages();
      } else {
        // First run: seed defaults; the demo-mode check below imports the
        // initial sample packet, so seeding respects whatever demoMode defaults to.
        set({ boards: mockBoards, activeBoardId: mockBoards[0].id, settings: DEFAULT_SETTINGS });
      }
      // In demo mode, ensure the active board has at least one packet to read.
      // With demo off, a board stays empty until a real sync so sample data
      // never mixes into live testing (and deleted samples stay deleted).
      const board = activeBoardOf();
      if (get().settings.demoMode && board && !get().packets.some((p) => p.bbsId === board.bbsId)) {
        await importSamplePacket();
      }
      set({ hydrated: true });
    },

    connect: async (password) => {
      const board = activeBoardOf();
      if (!board) return;
      set({ connecting: true, error: null });
      if (get().settings.demoMode) {
        setTimeout(() => set({ connecting: false, loggedIn: true }), 1600);
        return;
      }
      try {
        let pairing = board.pairing;
        if (!pairing) {
          if (!board.handle.trim()) throw new Error('Enter a handle for this board first (Boards › edit).');
          if (!password) throw new Error('Enter your password to pair this phone.');
          set({ pairing: true });
          const deviceName = defaultDeviceName();
          const result = await pairDevice(makeClient(board), {
            handle: board.handle,
            password,
            deviceName,
            signer: boardSigner(board),
          });
          pairing = { ...result, deviceName, pairedAt: new Date().toISOString() };
          setPairing(board.id, pairing);
          set({ pairing: false });
          persist();
        }
        activeSession = makeSession({ ...board, pairing });
        await activeSession.login();
        set({ connecting: false, loggedIn: true });
      } catch (e) {
        activeSession = null;
        failWith(board, e, { connecting: false, pairing: false, loggedIn: false });
      }
    },
    disconnect: () => {
      endSession();
      set({ loggedIn: false, connecting: false, pairing: false, error: null });
    },
    forgetPairing: async (boardId) => {
      const board = get().boards.find((b) => b.id === boardId);
      if (!board) return;
      if (boardId === get().activeBoardId) {
        endSession();
        set({ loggedIn: false, error: null });
      }
      await dropPairing(board);
    },

    syncNow: async () => {
      const board = activeBoardOf();
      if (!board) return;
      set({ syncing: true, error: null, lastSyncResult: null });
      if (get().settings.demoMode) {
        setTimeout(async () => {
          await importSamplePacket();
          set({ syncing: false, lastSyncResult: 'packet' });
        }, 1800);
        return;
      }
      try {
        if (!activeSession) activeSession = makeSession(board);
        const id = nextId('pkt');

        // Stream the packet straight to its cache file when the transport supports
        // it (pinned/native) — the body never buffers in memory or crosses the RN
        // bridge as base64. Non-pinned boards fall back to an in-memory download.
        let result: DownloadToFileResult;
        if (activeSession.canStreamToFile) {
          // Only the streaming path emits byte-level progress; wire the bar here so
          // the fallback below keeps SyncScreen's indeterminate reveal animation
          // (progress stays null) rather than freezing it at 0%.
          set({ downloadProgress: 0 });
          const onProgress = (written: number, total: number) =>
            set({ downloadProgress: total > 0 ? Math.min(1, written / total) : null });
          result = await activeSession.downloadToFile(packetFilePath(id), onProgress);
        } else {
          const d = await activeSession.download();
          if (d.kind === 'packet') {
            writePacketBytes(id, d.bytes);
            result = { kind: 'packet', messageCount: d.messageCount };
          } else {
            result = { kind: 'none' };
          }
        }
        set({ downloadProgress: null });
        if (result.kind === 'none') {
          set({ syncing: false, lastSyncResult: 'none' }); // no new mail; nothing to commit
          return;
        }

        // Bytes are committed to disk (server already advanced newscan). Read them
        // back to parse for meta + taxonomy — parsing is in-memory, but streaming
        // spared the *transfer* from buffering the whole packet as a base64 blob.
        const bytes = await readPacketBytes(id);
        if (!bytes) {
          deletePacketBytes(id);
          set({ syncing: false, error: 'Downloaded packet could not be read.' });
          return;
        }
        const parsed = readQwkPacket(bytes);
        // Adopt the server's real BBSID from CONTROL.DAT. The board's id is
        // initially derived from its name, which may not match the server —
        // and a mismatch gets REP uploads rejected (wrongBBS). Everything keyed
        // by bbsId (packet meta, message ids, the .REP block-0 id) uses this.
        const bbsId = parsed.control.bbsId || board.bbsId;
        // Adopt the sysop name the same way — the seeded board value is a
        // placeholder until the server's CONTROL.DAT says who actually runs it.
        const sysop = parsed.control.sysop || board.sysop;
        const tax = buildTaxonomy(parsed.control.conferences, parsed.areaIndex);
        const meta: Packet = {
          id,
          bbsId,
          file: `${bbsId}.QWK`,
          msgs: parsed.messages.length,
          confs: tax.conferences.length,
          areas: tax.areas.length,
          kb: Math.max(1, Math.round(bytes.length / 1024)),
          date: stamp(),
        };
        // A real packet supersedes any demo samples for this board: without the
        // purge they'd be re-keyed to the adopted bbsId below and leak fake
        // messages/conferences into the live view (reloadMessages unions every
        // cached packet for the bbsId).
        const sampleIds = new Set(
          get().packets.filter((p) => p.sample && p.bbsId === board.bbsId).map((p) => p.id)
        );
        for (const sid of sampleIds) deletePacketBytes(sid);
        // Packet re-keying is tied to the bbsId alone — a sysop-only change
        // updates the board record without touching cached packet entries.
        const rekey = bbsId !== board.bbsId;
        const adopted = rekey || sysop !== board.sysop;
        set((s) => {
          const kept = s.packets.filter((p) => !sampleIds.has(p.id));
          return {
            boards: adopted ? s.boards.map((b) => (b.id === board.id ? { ...b, bbsId, sysop } : b)) : s.boards,
            // Re-key this board's existing packets to the adopted id too, so
            // reloadMessages (which filters by bbsId) keeps showing their history
            // instead of orphaning it under the old derived id.
            packets: [
              meta,
              ...(rekey
                ? kept.map((p) => (p.bbsId === board.bbsId ? { ...p, bbsId, file: `${bbsId}.QWK` } : p))
                : kept),
            ],
            lastPacket: meta,
          };
        });
        await reloadMessages();
        set({ syncing: false, lastSyncResult: 'packet' });
        persist();
      } catch (e) {
        failWith(board, e, { syncing: false, downloadProgress: null });
      }
    },

    markRead: (id) => {
      if (get().readIds.has(id)) return;
      const next = new Set(get().readIds);
      next.add(id);
      set({ readIds: next });
      persist();
    },
    clearError: () => set({ error: null }),

    selectBoard: (id) => {
      const state = get();
      const changed = id !== state.activeBoardId;
      const wasLoggedIn = state.loggedIn && changed;
      if (changed) endSession(); // each board has its own pairing + session
      set({ activeBoardId: id, ...(wasLoggedIn ? { loggedIn: false } : {}), ...(changed ? { error: null } : {}) });
      persist();
      void reloadMessages().then(() => {
        const board = activeBoardOf();
        if (get().settings.demoMode && board && !get().packets.some((p) => p.bbsId === board.bbsId))
          void importSamplePacket();
      });
      return { disconnected: wasLoggedIn };
    },

    addBoard: (input) => {
      const id = nextId('b');
      set((s) => ({ boards: [...s.boards, { ...input, id, bbsId: deriveBbsId(input.name) }] }));
      persist();
    },

    updateBoard: (id, input) => {
      const existing = get().boards.find((b) => b.id === id);
      // The device key is registered with one account on one server; a change
      // of server or handle would otherwise keep logging in as the old pairing.
      const unpaired =
        !!existing?.pairing &&
        (existing.host !== input.host ||
          existing.port !== input.port ||
          existing.handle.trim().toLowerCase() !== input.handle.trim().toLowerCase());
      set((s) => ({
        boards: s.boards.map((b) =>
          b.id === id ? { ...b, ...input, bbsId: deriveBbsId(input.name), pairing: unpaired ? undefined : b.pairing } : b
        ),
      }));
      persist();
      if (unpaired && existing) {
        if (id === get().activeBoardId) {
          endSession();
          set({ loggedIn: false });
        }
        void boardSigner(existing).delete();
      }
      return { unpaired };
    },

    deleteBoard: (id) => {
      const state = get();
      if (state.boards.length <= 1) return false;
      const boards = state.boards.filter((b) => b.id !== id);
      const activeBoardId = state.activeBoardId === id ? boards[0].id : state.activeBoardId;
      set({ boards, activeBoardId });
      if (state.activeBoardId === id) endSession();
      const gone = state.boards.find((b) => b.id === id);
      if (gone) void boardSigner(gone).delete(); // drop the hardware key too
      persist();
      if (state.activeBoardId === id) void reloadMessages();
      return true;
    },

    addDraft: (draft) => {
      set((s) => ({ drafts: [...s.drafts, { ...draft, id: nextId('d') }] }));
      persist();
    },
    updateDraft: (id, patch) => {
      set((s) => ({ drafts: s.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
      persist();
    },
    removeDraft: (id) => {
      set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }));
      persist();
    },

    uploadRep: async () => {
      const board = activeBoardOf();
      if (!board) return;
      // Only the active board's drafts go into its .REP; other boards' drafts
      // stay in the outbox until their board is active.
      const drafts = draftsForBoard(get().drafts, board.id);
      const remaining = () => get().drafts.filter((d) => d.boardId !== board.id);
      set({ uploading: true, error: null });
      if (get().settings.demoMode) {
        setTimeout(() => {
          if (drafts.length) buildRepFromDrafts(board.bbsId, drafts, currentTagline()); // exercise the writer
          const report: ImportReport = {
            posted: drafts.length,
            linked: drafts.filter((d) => d.subject.toLowerCase().startsWith('re:')).length,
            dup: 0,
            skipped: 0,
          };
          set({ uploading: false, report, drafts: remaining() });
          persist();
        }, 1700);
        return;
      }
      try {
        if (!activeSession) activeSession = makeSession(board);
        const result = await pushDrafts(activeSession, board.bbsId, drafts, currentTagline());
        if (result.wrongBBS) {
          // Nothing posted — keep the outbox so the user can fix the board id.
          set({ uploading: false, error: `Server rejected packet: wrong BBS id (${board.bbsId}).` });
          return;
        }
        const report: ImportReport = {
          posted: result.posted,
          linked: drafts.filter((d) => d.subject.toLowerCase().startsWith('re:')).length,
          dup: result.duplicate,
          skipped: result.skipped,
        };
        set({ uploading: false, report, drafts: remaining() });
        persist();
      } catch (e) {
        // Upload is idempotent (server de-dupes) — safe to retry; keep drafts.
        failWith(board, e, { uploading: false });
      }
    },
    clearReport: () => set({ report: null }),

    deletePacket: (id) => {
      deletePacketBytes(id);
      set((s) => ({ packets: s.packets.filter((p) => p.id !== id) }));
      persist();
      void reloadMessages();
    },
    clearPackets: () => {
      clearAllPacketBytes();
      set({ packets: [], lastPacket: null });
      persist();
      void reloadMessages();
    },

    setPlatform: (platform) => {
      set((s) => ({ settings: { ...s.settings, platform } }));
      persist();
    },
    toggleScanlines: () => {
      set((s) => ({ settings: { ...s.settings, scanlines: !s.settings.scanlines } }));
      persist();
    },
    toggleGlow: () => {
      set((s) => ({ settings: { ...s.settings, glow: !s.settings.glow } }));
      persist();
    },
    toggleDemoMode: () => {
      endSession(); // switching transport mode drops any live session
      set((s) => ({ settings: { ...s.settings, demoMode: !s.settings.demoMode }, loggedIn: false, error: null }));
      persist();
    },
  };
});

// --- taxonomy helper re-export (conferences/areas live in store state) ---
export { areasForConference };

// --- selectors over the dynamic message list ---

export function activeBoard(state: AppState): Board | undefined {
  return state.boards.find((b) => b.id === state.activeBoardId);
}
export function messagesForArea(messages: Message[], areaId: string): Message[] {
  return messages.filter((m) => m.areaId === areaId);
}
export { draftsForMessage, draftsForBoard } from './draftSelectors';
export { privateMessages, privateUnread, unreadTotal, visibleMessages } from './counts';
export function unreadInArea(messages: Message[], areaId: string, readIds: Set<string>): number {
  return messagesForArea(messages, areaId).reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
export function unreadInConference(
  messages: Message[],
  areas: AreaConfig[],
  conferenceId: string,
  readIds: Set<string>
): number {
  return areasForConference(areas, conferenceId).reduce((n, a) => n + unreadInArea(messages, a.id, readIds), 0);
}

export { PRIVATE_CONFERENCE };
