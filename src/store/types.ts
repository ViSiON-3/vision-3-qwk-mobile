/** UI-facing view models for the app shell (mock-backed for now). */

/** What pairing left behind. No secret here — the private key that makes these
 * ids useful lives in the Secure Enclave / Keystore under the board's alias. */
export interface BoardPairing {
  /** Server-issued id of this phone's registered key. */
  deviceId: string;
  /** The server's board identity, bound into every signed login message. */
  boardId: string;
  /** Name registered with the server (shown in its device list). */
  deviceName: string;
  /** ISO timestamp. */
  pairedAt: string;
}

export interface Board {
  id: string;
  name: string;
  host: string;
  port: number;
  handle: string;
  /** Set once this phone has paired with the board. The password is never kept:
   * it is typed once to pair and discarded (see store.connect). */
  pairing?: BoardPairing;
  /** Derived BBS id (uppercased alnum, <=8) or server-provided. */
  bbsId: string;
  /** Pinned server TLS cert SHA-256 (bare hex). Empty/undefined = no pinning. */
  fingerprint?: string;
  sysop?: string;
  node?: string;
}

export interface Settings {
  platform: 'ios' | 'android';
  scanlines: boolean;
  glow: boolean;
  /** When true, sync/upload use a generated sample packet instead of the network. */
  demoMode: boolean;
}

export interface Conference {
  id: string;
  number: number;
  name: string;
  tag: string;
  /** True for networked conferences (shows the NET chip, cyan icon). */
  isNet: boolean;
}

export interface Area {
  id: string;
  conferenceId: string;
  number: number;
  name: string;
  tag: string;
}

export interface Message {
  id: string;
  number: number;
  areaId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  time: string;
  body: string;
  isPrivate: boolean;
  preview: string;
  /** Parent message number this replies to (QWK offset-108 reference), if any. */
  reference?: number;
  /** RFC-style Message-ID from HEADERS.DAT — the In-Reply-To target when replying. */
  messageId?: string;
}

export interface Draft {
  id: string;
  /** Board the draft was composed on — scopes Reader display and REP upload. */
  boardId: string;
  to: string;
  from: string;
  subject: string;
  areaName: string;
  conferenceNumber: number;
  priv: boolean;
  body: string;
  /** Parent message number, for in-packet threading (QWK offset 108). */
  reference?: number;
  /** Parent Message-ID, for durable HEADERS.DAT In-Reply-To threading. */
  inReplyTo?: string;
}

export interface Packet {
  id: string;
  bbsId: string;
  file: string;
  msgs: number;
  confs: number;
  areas: number;
  kb: number;
  date: string;
  /** Demo-mode sample packet — purged when a real packet arrives for the board. */
  sample?: boolean;
}

export interface ImportReport {
  posted: number;
  linked: number;
  dup: number;
  skipped: number;
}
