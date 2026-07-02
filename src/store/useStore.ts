import { create } from 'zustand';
import { Board, Draft, ImportReport, Message, Packet, Settings } from './types';
import { mockBoards } from './mockData';
import { conferences, areas, areasForConference, PRIVATE_CONFERENCE } from './taxonomy';
import { buildSampleQwk } from './sampleQwk';
import { parsePacketToMessages } from './viewModel';
import { buildRepFromDrafts } from './repBuilder';
import { readQwkPacket } from '../qwk';
import {
  writePacketBytes,
  readPacketBytes,
  deletePacketBytes,
  clearAllPacketBytes,
} from '../storage/packetCache';
import { loadPersistedState, savePersistedState, PersistedState } from '../storage/persistence';

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

const DEFAULT_SETTINGS: Settings = { platform: 'ios', scanlines: true, glow: true };

export interface AppState {
  hydrated: boolean;

  boards: Board[];
  activeBoardId: string;

  loggedIn: boolean;
  connecting: boolean;

  syncing: boolean;
  lastPacket: Packet | null;

  /** Messages parsed from the active board's cached packets. */
  messages: Message[];
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

  /** Re-parse the active board's cached packets into state.messages. */
  const reloadMessages = async () => {
    const board = activeBoardOf();
    if (!board) return set({ messages: [] });
    const byId = new Map<string, Message>();
    for (const p of get().packets.filter((pk) => pk.bbsId === board.bbsId)) {
      const bytes = await readPacketBytes(p.id);
      if (!bytes) continue;
      for (const m of parsePacketToMessages(bytes, board.bbsId)) byId.set(m.id, m);
    }
    set({ messages: [...byId.values()] });
  };

  /** Build + cache a sample .QWK for the active board (stands in for download). */
  const importSamplePacket = async () => {
    const board = activeBoardOf();
    if (!board) return;
    const bytes = buildSampleQwk(board.bbsId);
    const id = nextId('pkt');
    writePacketBytes(id, bytes);
    const parsed = readQwkPacket(bytes);
    const meta: Packet = {
      id,
      bbsId: board.bbsId,
      file: `${board.bbsId}.QWK`,
      msgs: parsed.messages.length,
      confs: conferences.length,
      areas: areas.length,
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

    syncing: false,
    lastPacket: null,

    messages: [],
    readIds: new Set<string>(),

    drafts: [],
    uploading: false,
    report: null,

    packets: [],
    settings: DEFAULT_SETTINGS,

    hydrate: async () => {
      const persisted = await loadPersistedState();
      if (persisted) {
        set({
          boards: persisted.boards.length ? persisted.boards : mockBoards,
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

    connect: () => {
      set({ connecting: true });
      setTimeout(() => set({ connecting: false, loggedIn: true }), 1600);
    },
    disconnect: () => set({ loggedIn: false, connecting: false }),

    syncNow: () => {
      set({ syncing: true });
      setTimeout(async () => {
        await importSamplePacket();
        set({ syncing: false });
      }, 1800);
    },

    markRead: (id) => {
      if (get().readIds.has(id)) return;
      const next = new Set(get().readIds);
      next.add(id);
      set({ readIds: next });
      persist();
    },

    selectBoard: (id) => {
      const state = get();
      const wasLoggedIn = state.loggedIn && id !== state.activeBoardId;
      set({ activeBoardId: id, ...(wasLoggedIn ? { loggedIn: false } : {}) });
      persist();
      void reloadMessages().then(() => {
        const board = activeBoardOf();
        if (board && !get().packets.some((p) => p.bbsId === board.bbsId)) void importSamplePacket();
      });
      return { disconnected: wasLoggedIn };
    },

    addBoard: (input) => {
      set((s) => ({ boards: [...s.boards, { ...input, id: nextId('b'), bbsId: deriveBbsId(input.name) }] }));
      persist();
    },

    updateBoard: (id, input) => {
      set((s) => ({
        boards: s.boards.map((b) => (b.id === id ? { ...b, ...input, bbsId: deriveBbsId(input.name) } : b)),
      }));
      persist();
    },

    deleteBoard: (id) => {
      const state = get();
      if (state.boards.length <= 1) return false;
      const boards = state.boards.filter((b) => b.id !== id);
      const activeBoardId = state.activeBoardId === id ? boards[0].id : state.activeBoardId;
      set({ boards, activeBoardId });
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

    uploadRep: () => {
      set({ uploading: true });
      setTimeout(() => {
        const drafts = get().drafts;
        const board = activeBoardOf();
        // Compile the outbox into a real .REP (validates the engine writer path).
        // Online mode will `await session.upload(rep)` and use the server's
        // import result; offline we simulate the report from the drafts.
        if (board && drafts.length) buildRepFromDrafts(board.bbsId, drafts);
        const report: ImportReport = {
          posted: drafts.length,
          linked: drafts.filter((d) => d.subject.toLowerCase().startsWith('re:')).length,
          dup: 0,
          skipped: 0,
        };
        set({ uploading: false, report, drafts: [] });
        persist();
      }, 1700);
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
  };
});

// --- taxonomy re-exports (static config) ---
export { conferences, areas, areasForConference };

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
export function unreadInConference(messages: Message[], conferenceId: string, readIds: Set<string>): number {
  return areasForConference(conferenceId).reduce((n, a) => n + unreadInArea(messages, a.id, readIds), 0);
}
export function privateUnread(messages: Message[], readIds: Set<string>): number {
  return privateMessages(messages).reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
export function unreadTotal(messages: Message[], readIds: Set<string>): number {
  return messages.reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
export { PRIVATE_CONFERENCE };
