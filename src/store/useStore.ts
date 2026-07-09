import { create } from 'zustand';
import { Board, Conference, Draft, ImportReport, Message, Packet, Settings } from './types';
import { mockBoards } from './mockData';
import { buildTaxonomy, areasForConference, AreaConfig, PRIVATE_CONFERENCE } from './taxonomy';
import { buildSampleQwk } from './sampleQwk';
import { parsePacket } from './viewModel';
import { buildRepFromDrafts } from './repBuilder';
import { makeSession, pushDrafts, describeSyncError } from './net';
import { QwkSession, DownloadToFileResult } from '../api';
import { readQwkPacket } from '../qwk';
import {
  writePacketBytes,
  readPacketBytes,
  deletePacketBytes,
  clearAllPacketBytes,
  packetFilePath,
} from '../storage/packetCache';
import { loadPersistedState, savePersistedState, PersistedState } from '../storage/persistence';
import { getBoardPassword, setBoardPassword, deleteBoardPassword } from '../storage/secrets';

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

export interface AppState {
  hydrated: boolean;

  boards: Board[];
  activeBoardId: string;

  loggedIn: boolean;
  connecting: boolean;
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
  connect: () => void;
  disconnect: () => void;
  syncNow: () => void;
  markRead: (id: string) => void;
  clearError: () => void;

  // boards
  selectBoard: (id: string) => { disconnected: boolean };
  addBoard: (input: Omit<Board, 'id' | 'bbsId'>) => void;
  updateBoard: (id: string, input: Omit<Board, 'id' | 'bbsId'>) => void;
  deleteBoard: (id: string) => boolean;

  // outbox
  addDraft: (draft: Omit<Draft, 'id'>) => void;
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
    // Strip passwords — they live in the keychain (secrets.ts), never in the
    // plaintext AsyncStorage snapshot.
    boards: s.boards.map(({ pass: _pass, ...b }) => b),
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

  /** Re-parse the active board's cached packets into state.messages and rebuild
   * the conference/area taxonomy from the union of their CONTROL.DAT entries. */
  const reloadMessages = async () => {
    const board = activeBoardOf();
    if (!board) return set({ messages: [], conferences: [], areas: [] });
    const boardId = board.id;
    const bbsId = board.bbsId;
    const byId = new Map<string, Message>();
    const confByNum = new Map<number, string>(); // union of CONTROL.DAT conferences
    for (const p of get().packets.filter((pk) => pk.bbsId === bbsId)) {
      const bytes = await readPacketBytes(p.id);
      if (!bytes) continue;
      const { messages, qwkConferences } = parsePacket(bytes, bbsId);
      // Packets are stored newest-first, so keep the first (newest) copy of each
      // stable id — an older cached packet must not clobber newer metadata.
      for (const m of messages) if (!byId.has(m.id)) byId.set(m.id, m);
      for (const c of qwkConferences) if (!confByNum.has(c.number)) confByNum.set(c.number, c.name);
    }
    // Bail if the active board changed while we awaited reads — a stale reload
    // must not overwrite the current board's messages/taxonomy.
    if (get().activeBoardId !== boardId) return;
    const { conferences, areas } = buildTaxonomy(
      [...confByNum.entries()].map(([number, name]) => ({ number, name }))
    );
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
    const tax = buildTaxonomy(parsed.control.conferences);
    const meta: Packet = {
      id,
      bbsId: board.bbsId,
      file: `${board.bbsId}.QWK`,
      msgs: parsed.messages.length,
      confs: tax.conferences.length,
      areas: tax.areas.length,
      kb: Math.max(1, Math.round(bytes.length / 1024)),
      date: stamp(),
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
    error: null,

    syncing: false,
    downloadProgress: null,
    lastPacket: null,

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
        // Board metadata comes from AsyncStorage; passwords from the keychain.
        const base = persisted.boards.length ? persisted.boards : mockBoards;
        const boards: Board[] = await Promise.all(
          base.map(async (b) => ({ ...b, pass: await getBoardPassword(b.id) }))
        );
        set({
          boards,
          activeBoardId: persisted.activeBoardId || mockBoards[0].id,
          settings: { ...DEFAULT_SETTINGS, ...persisted.settings },
          drafts: persisted.drafts ?? [],
          packets: persisted.packets ?? [],
          readIds: new Set(persisted.readIds ?? []),
        });
        await reloadMessages();
      } else {
        // First run: seed defaults and generate an initial sample packet.
        set({ boards: mockBoards, activeBoardId: mockBoards[0].id, settings: DEFAULT_SETTINGS });
        await importSamplePacket();
      }
      // Ensure the active board has at least one packet to read.
      const board = activeBoardOf();
      if (board && !get().packets.some((p) => p.bbsId === board.bbsId)) {
        await importSamplePacket();
      }
      set({ hydrated: true });
    },

    connect: async () => {
      const board = activeBoardOf();
      if (!board) return;
      set({ connecting: true, error: null });
      if (get().settings.demoMode) {
        setTimeout(() => set({ connecting: false, loggedIn: true }), 1600);
        return;
      }
      try {
        activeSession = makeSession(board);
        await activeSession.login();
        set({ connecting: false, loggedIn: true });
      } catch (e) {
        activeSession = null;
        set({ connecting: false, loggedIn: false, error: describeSyncError(e) });
      }
    },
    disconnect: () => {
      activeSession = null;
      set({ loggedIn: false, connecting: false, error: null });
    },

    syncNow: async () => {
      const board = activeBoardOf();
      if (!board) return;
      set({ syncing: true, error: null });
      if (get().settings.demoMode) {
        setTimeout(async () => {
          await importSamplePacket();
          set({ syncing: false });
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
          set({ syncing: false }); // no new mail; nothing to commit
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
        const tax = buildTaxonomy(parsed.control.conferences);
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
        const adopted = bbsId !== board.bbsId;
        set((s) => ({
          boards: adopted ? s.boards.map((b) => (b.id === board.id ? { ...b, bbsId } : b)) : s.boards,
          // Re-key this board's existing packets to the adopted id too, so
          // reloadMessages (which filters by bbsId) keeps showing their history
          // instead of orphaning it under the old derived id.
          packets: [
            meta,
            ...(adopted
              ? s.packets.map((p) => (p.bbsId === board.bbsId ? { ...p, bbsId, file: `${bbsId}.QWK` } : p))
              : s.packets),
          ],
          lastPacket: meta,
        }));
        await reloadMessages();
        set({ syncing: false });
        persist();
      } catch (e) {
        set({ syncing: false, downloadProgress: null, error: describeSyncError(e) });
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
      if (changed) activeSession = null; // creds differ per board
      set({ activeBoardId: id, ...(wasLoggedIn ? { loggedIn: false } : {}), ...(changed ? { error: null } : {}) });
      persist();
      void reloadMessages().then(() => {
        const board = activeBoardOf();
        if (board && !get().packets.some((p) => p.bbsId === board.bbsId)) void importSamplePacket();
      });
      return { disconnected: wasLoggedIn };
    },

    addBoard: (input) => {
      const id = nextId('b');
      set((s) => ({ boards: [...s.boards, { ...input, id, bbsId: deriveBbsId(input.name) }] }));
      void setBoardPassword(id, input.pass); // keychain, not the persisted snapshot
      persist();
    },

    updateBoard: (id, input) => {
      set((s) => ({
        boards: s.boards.map((b) => (b.id === id ? { ...b, ...input, bbsId: deriveBbsId(input.name) } : b)),
      }));
      void setBoardPassword(id, input.pass);
      persist();
    },

    deleteBoard: (id) => {
      const state = get();
      if (state.boards.length <= 1) return false;
      const boards = state.boards.filter((b) => b.id !== id);
      const activeBoardId = state.activeBoardId === id ? boards[0].id : state.activeBoardId;
      set({ boards, activeBoardId });
      void deleteBoardPassword(id); // drop the keychain entry too
      persist();
      if (state.activeBoardId === id) void reloadMessages();
      return true;
    },

    addDraft: (draft) => {
      set((s) => ({ drafts: [...s.drafts, { ...draft, id: nextId('d') }] }));
      persist();
    },
    removeDraft: (id) => {
      set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }));
      persist();
    },

    uploadRep: async () => {
      const board = activeBoardOf();
      if (!board) return;
      const drafts = get().drafts;
      set({ uploading: true, error: null });
      if (get().settings.demoMode) {
        setTimeout(() => {
          if (drafts.length) buildRepFromDrafts(board.bbsId, drafts); // exercise the writer
          const report: ImportReport = {
            posted: drafts.length,
            linked: drafts.filter((d) => d.subject.toLowerCase().startsWith('re:')).length,
            dup: 0,
            skipped: 0,
          };
          set({ uploading: false, report, drafts: [] });
          persist();
        }, 1700);
        return;
      }
      try {
        if (!activeSession) activeSession = makeSession(board);
        const result = await pushDrafts(activeSession, board.bbsId, drafts);
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
        set({ uploading: false, report, drafts: [] });
        persist();
      } catch (e) {
        // Upload is idempotent (server de-dupes) — safe to retry; keep drafts.
        set({ uploading: false, error: describeSyncError(e) });
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
      activeSession = null; // switching transport mode drops any live session
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
export function privateMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.isPrivate);
}
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
export function privateUnread(messages: Message[], readIds: Set<string>): number {
  return privateMessages(messages).reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
export function unreadTotal(messages: Message[], readIds: Set<string>): number {
  return messages.reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
export { PRIVATE_CONFERENCE };
