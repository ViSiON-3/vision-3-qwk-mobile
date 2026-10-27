import { deviceLoginMessage, DEVICE_LOGIN_PREFIX } from './deviceLogin';

describe('deviceLoginMessage', () => {
  it('joins the prefix, board id, device id and challenge with newlines, as UTF-8', () => {
    const bytes = deviceLoginMessage('board-1', 'dev-9', 'abc==');
    expect(new TextDecoder().decode(bytes)).toBe(`${DEVICE_LOGIN_PREFIX}\nboard-1\ndev-9\nabc==`);
  });

  it('uses the exact v1 prefix the server checks', () => {
    expect(DEVICE_LOGIN_PREFIX).toBe('ViSiON/3 QWK API device login v1');
  });

  it('encodes non-ASCII as UTF-8 rather than Latin-1', () => {
    const bytes = deviceLoginMessage('b', 'd', 'é');
    expect(Array.from(bytes.slice(-2))).toEqual([0xc3, 0xa9]);
  });
});
