/** Structured model produced/consumed by the QWK/REP engine. */

export interface QwkConference {
  /** Conference number as listed in CONTROL.DAT (arbitrary integer). */
  number: number;
  /** Conference display name. */
  name: string;
}

export interface ControlDat {
  bbsName: string;
  city: string;
  phone: string;
  sysop: string;
  /** Mail-door serial/registration number (before the comma on line 5). */
  serial: string;
  /** BBS identifier used to name packets (after the comma on line 5). */
  bbsId: string;
  /** Raw packet creation timestamp, `MM-DD-YYYY,HH:MM:SS`. */
  createdAt: string;
  /** User the packet was built for (conventionally uppercase). */
  username: string;
  /** Conference directory, keyed by conference number. */
  conferences: QwkConference[];
  welcomeFile?: string;
  newsFile?: string;
  goodbyeFile?: string;
}

export interface QwkMessage {
  /** Status flag char at offset 0 (e.g. ' ', '-', '*', '+'). */
  status: string;
  /** Message number (offset 1). */
  number: number;
  /** Raw date field `MM-DD-YY` (offset 8). */
  date: string;
  /** Raw time field `HH:MM` (offset 16). */
  time: string;
  /** Recipient. Full value from HEADERS.DAT/kludge when available, else the 25-byte field. */
  to: string;
  /** Sender. Full value when available. */
  from: string;
  /** Subject. Full value when available. */
  subject: string;
  /** Message-level password (offset 96); usually blank. */
  password: string;
  /** In-reply-to message number (offset 108); 0 when none. */
  reference: number;
  /** Conference number (offset 123, uint16 LE). */
  conference: number;
  /** Per-conference logical message number (offset 125, uint16 LE). */
  logicalNumber: number;
  /** True when the active flag (offset 122) is 0xE1; false when 0xE2 (deleted). */
  active: boolean;
  /** Derived from the status flag: private (`*`/`+`) vs public. */
  isPrivate: boolean;
  /** True when the net-tagline indicator (offset 127) is set. */
  hasNetTagline: boolean;
  /** Decoded body text, hard line breaks as `\n`. */
  body: string;
  /** Byte offset of this message's header block within MESSAGES.DAT (HEADERS.DAT key). */
  blockOffset: number;
  /** Extended: RFC-style Message-ID from HEADERS.DAT. */
  messageId?: string;
  /** Extended: parent Message-ID from HEADERS.DAT In-Reply-To. */
  inReplyTo?: string;
  /** Extended: message flagged UTF-8. */
  utf8?: boolean;
  /** All extended header fields for this message from HEADERS.DAT. */
  extHeaders?: Record<string, string>;
}

export interface QwkPacket {
  control: ControlDat;
  messages: QwkMessage[];
  /** Conference number -> name, for convenience. */
  conferenceNames: Map<number, string>;
}

/** A reply the user composed offline, to be compiled into a .REP packet. */
export interface ReplyDraft {
  to: string;
  from: string;
  subject: string;
  /** Destination conference number to post into (routes the reply). */
  conference: number;
  /** Body text with `\n` line breaks. */
  body: string;
  isPrivate?: boolean;
  /** Parent message number for in-packet threading (offset 108). */
  reference?: number;
  /** Composition date `MM-DD-YY`; caller supplies for retry-stable bytes. */
  date?: string;
  /** Composition time `HH:MM`. */
  time?: string;
  /** Message-ID to emit in HEADERS.DAT (durable threading). */
  messageId?: string;
  /** Parent Message-ID for HEADERS.DAT In-Reply-To. */
  inReplyTo?: string;
}
