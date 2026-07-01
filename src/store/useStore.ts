import { create } from 'zustand';
import { Board, Draft, ImportReport, Packet, Settings } from './types';
import {
  mockAreas,
  mockBoards,
  mockConferences,
  mockLastPacket,
  mockMessages,
  mockPackets,
} from './mockData';

let idSeq = 100;
const nextId = (prefix: string) => `${prefix}${++idSeq}`;

/** Derive a BBS id from a board name: uppercased alphanumerics, <= 8 chars. */
export function deriveBbsId(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BBS';
}

export interface AppState {
  // Boards
  boards: Board[];
  activeBoardId: string;

  // Session
  loggedIn: boolean;
  connecting: boolean;

  // Sync
  syncing: boolean;
  lastPacket: Packet | null;

  // Read state
  readIds: Set<string>;

  // Outbox
  drafts: Draft[];
  uploading: boolean;
  report: ImportReport | null;

  // Storage
  packets: Packet[];

  // Settings
  settings: Settings;

  // --- actions ---
  connect: () => void;
  disconnect: () => void;
  syncNow: () => void;
  markRead: (id: string) => void;

  selectBoard: (id: string) => { disconnected: boolean };
  addBoard: (input: Omit<Board, 'id' | 'bbsId'>) => void;
  updateBoard: (id: string, input: Omit<Board, 'id' | 'bbsId'>) => void;
  deleteBoard: (id: string) => boolean;

  addDraft: (draft: Omit<Draft, 'id'>) => void;
  removeDraft: (id: string) => void;
  uploadRep: () => void;
  clearReport: () => void;

  deletePacket: (id: string) => void;
  clearPackets: () => void;

  setPlatform: (p: Settings['platform']) => void;
  toggleScanlines: () => void;
  toggleGlow: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  boards: mockBoards,
  activeBoardId: mockBoards[0].id,

  loggedIn: false,
  connecting: false,

  syncing: false,
  lastPacket: mockLastPacket,

  readIds: new Set<string>(),

  drafts: [],
  uploading: false,
  report: null,

  packets: mockPackets,

  settings: { platform: 'ios', scanlines: true, glow: true },

  connect: () => {
    set({ connecting: true });
    setTimeout(() => set({ connecting: false, loggedIn: true }), 1600);
  },
  disconnect: () => set({ loggedIn: false, connecting: false }),

  syncNow: () => {
    set({ syncing: true });
    setTimeout(() => {
      const active = get().boards.find((b) => b.id === get().activeBoardId);
      const pkt: Packet = {
        ...mockLastPacket,
        id: nextId('pkt'),
        bbsId: active?.bbsId ?? mockLastPacket.bbsId,
        file: `${active?.bbsId ?? 'V3HQ'}.QWK`,
      };
      set((s) => ({ syncing: false, lastPacket: pkt, packets: [pkt, ...s.packets] }));
    }, 1800);
  },

  markRead: (id) =>
    set((s) => {
      if (s.readIds.has(id)) return s;
      const next = new Set(s.readIds);
      next.add(id);
      return { readIds: next };
    }),

  selectBoard: (id) => {
    const state = get();
    const wasLoggedIn = state.loggedIn && id !== state.activeBoardId;
    set({ activeBoardId: id, ...(wasLoggedIn ? { loggedIn: false } : {}) });
    return { disconnected: wasLoggedIn };
  },

  addBoard: (input) =>
    set((s) => ({
      boards: [...s.boards, { ...input, id: nextId('b'), bbsId: deriveBbsId(input.name) }],
    })),

  updateBoard: (id, input) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === id ? { ...b, ...input, bbsId: deriveBbsId(input.name) } : b)),
    })),

  deleteBoard: (id) => {
    const state = get();
    if (state.boards.length <= 1) return false;
    const boards = state.boards.filter((b) => b.id !== id);
    const activeBoardId = state.activeBoardId === id ? boards[0].id : state.activeBoardId;
    set({ boards, activeBoardId });
    return true;
  },

  addDraft: (draft) => set((s) => ({ drafts: [...s.drafts, { ...draft, id: nextId('d') }] })),
  removeDraft: (id) => set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) })),

  uploadRep: () => {
    set({ uploading: true });
    setTimeout(() => {
      const drafts = get().drafts;
      const report: ImportReport = {
        posted: drafts.length,
        linked: drafts.filter((d) => d.subject.toLowerCase().startsWith('re:')).length,
        dup: 0,
        skipped: 0,
      };
      set({ uploading: false, report, drafts: [] });
    }, 1700);
  },
  clearReport: () => set({ report: null }),

  deletePacket: (id) => set((s) => ({ packets: s.packets.filter((p) => p.id !== id) })),
  clearPackets: () => set({ packets: [] }),

  setPlatform: (platform) => set((s) => ({ settings: { ...s.settings, platform } })),
  toggleScanlines: () => set((s) => ({ settings: { ...s.settings, scanlines: !s.settings.scanlines } })),
  toggleGlow: () => set((s) => ({ settings: { ...s.settings, glow: !s.settings.glow } })),
}));

// --- selectors (plain helpers over mock data) ---

export const conferences = mockConferences;
export const areas = mockAreas;
export const messages = mockMessages;

export function areasForConference(conferenceId: string) {
  return areas.filter((a) => a.conferenceId === conferenceId);
}
export function messagesForArea(areaId: string) {
  return messages.filter((m) => m.areaId === areaId);
}
export function privateMessages() {
  return messages.filter((m) => m.isPrivate);
}
export function activeBoard(state: AppState): Board | undefined {
  return state.boards.find((b) => b.id === state.activeBoardId);
}

// --- unread selectors (derive from the readIds set) ---

export function unreadInArea(areaId: string, readIds: Set<string>): number {
  return messagesForArea(areaId).reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
export function unreadInConference(conferenceId: string, readIds: Set<string>): number {
  return areasForConference(conferenceId).reduce((n, a) => n + unreadInArea(a.id, readIds), 0);
}
export function privateUnread(readIds: Set<string>): number {
  return privateMessages().reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
export function unreadTotal(readIds: Set<string>): number {
  return messages.reduce((n, m) => n + (readIds.has(m.id) ? 0 : 1), 0);
}
