/**
 * The message a paired device signs to log in. Binding the board and device
 * ids into the signed bytes means a signature captured here cannot be replayed
 * against another BBS the same phone is paired with. Must match the server
 * (`vision-3-bbs` docs/sysop/messages/qwk-api.md) byte for byte.
 */
import { encodeUtf8 } from '../qwk/utf8';

export const DEVICE_LOGIN_PREFIX = 'ViSiON/3 QWK API device login v1';

/** UTF-8 bytes of `<prefix>\n<boardId>\n<deviceId>\n<challenge>`. */
export function deviceLoginMessage(boardId: string, deviceId: string, challenge: string): Uint8Array {
  return encodeUtf8(`${DEVICE_LOGIN_PREFIX}\n${boardId}\n${deviceId}\n${challenge}`);
}
