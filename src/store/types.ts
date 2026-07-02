/** UI-facing view models for the app shell (mock-backed for now). */

export interface Board {
  id: string;
  name: string;
  host: string;
  port: number;
  handle: string;
  pass: string;
  /** Derived BBS id (uppercased alnum, <=8) or server-provided. */
  bbsId: string;
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
  reference?: number;
}

export interface Draft {
  id: string;
  to: string;
  from: string;
  subject: string;
  areaName: string;
  conferenceNumber: number;
  priv: boolean;
  body: string;
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
}

export interface ImportReport {
  posted: number;
  linked: number;
  dup: number;
  skipped: number;
}
