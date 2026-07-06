import { Board } from './types';

/** Seed boards for first run (persisted thereafter; editable in the Boards UI).
 * Passwords are intentionally blank — the user enters them per board in the UI;
 * seed data must never ship credentials. */
export const mockBoards: Board[] = [
  {
    id: 'b1',
    name: 'ViSiON/3 HQ',
    host: 'bbs.vision3.io',
    port: 8666,
    handle: 'Zaphod',
    pass: '',
    bbsId: 'V3HQ',
    sysop: 'Prime',
    node: '1',
  },
  {
    id: 'b2',
    name: 'Cathedral',
    host: 'cathedral.bbs.io',
    port: 8666,
    handle: 'Zaphod',
    pass: '',
    bbsId: 'CATHDRL',
    sysop: 'Deacon',
    node: '2',
  },
];
