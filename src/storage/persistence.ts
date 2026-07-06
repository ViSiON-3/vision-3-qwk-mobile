/**
 * Structured-state persistence via AsyncStorage. Stores a JSON snapshot of the
 * durable slices (boards, settings, drafts, packet metadata, read pointers).
 * Packet bytes are stored separately on the filesystem (see packetCache).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Board, Draft, Packet, Settings } from '../store/types';

const KEY = 'v3qwk:state:v1';

export interface PersistedState {
  /** Boards WITHOUT `pass` — passwords live in the keychain (see secrets.ts). */
  boards: Omit<Board, 'pass'>[];
  activeBoardId: string;
  settings: Settings;
  drafts: Draft[];
  packets: Packet[];
  /** Read message ids (a Set is serialized as an array). */
  readIds: string[];
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // best-effort; a failed persist should not crash the app
  }
}

export async function clearPersistedState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
