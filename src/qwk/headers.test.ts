import { parseHeadersDat, getHeaderField, serializeHeadersDat } from './headers';
import { encodeCp437 } from './cp437';
import { strToU8 } from 'fflate';

describe('parseHeadersDat', () => {
  it('keys sections by numeric hex byte-offset', () => {
    const map = parseHeadersDat(encodeCp437('[80]\r\nSubject: Hi\r\n\r\n[100]\r\nSubject: Bye\r\n'));
    expect(map.has(0x80)).toBe(true);
    expect(map.has(0x100)).toBe(true);
    expect(getHeaderField(map.get(0x80), 'subject')).toBe('Hi');
    expect(getHeaderField(map.get(0x100), 'Subject')).toBe('Bye');
  });

  it('matches sections by numeric value despite zero-padding / case', () => {
    const map = parseHeadersDat(encodeCp437('[0080]\r\nTo: X\r\n'));
    expect(map.has(0x80)).toBe(true);
  });

  it('supports both "key: value" and "key = value"', () => {
    const map = parseHeadersDat(encodeCp437('[80]\r\nTo: colon value\r\nFrom = equals value\r\n'));
    expect(getHeaderField(map.get(0x80), 'To')).toBe('colon value');
    expect(getHeaderField(map.get(0x80), 'From')).toBe('equals value');
  });

  it('preserves trailing whitespace for the colon form', () => {
    const map = parseHeadersDat(encodeCp437('[80]\r\nSubject: trailing   \r\n'));
    expect(getHeaderField(map.get(0x80), 'Subject')).toBe('trailing   ');
  });

  it('decodes UTF-8 values when the section is flagged Utf8', () => {
    const map = parseHeadersDat(strToU8('[80]\r\nUtf8: true\r\nSubject: café ☕ 日本\r\n'));
    expect(getHeaderField(map.get(0x80), 'Subject')).toBe('café ☕ 日本');
  });

  it('decodes high bytes as CP437 when not UTF-8 flagged', () => {
    // 0xDB is █ in CP437.
    const bytes = encodeCp437('[80]\r\nSubject: ') ;
    const full = new Uint8Array(bytes.length + 3);
    full.set(bytes, 0);
    full.set([0xdb, 0x0d, 0x0a], bytes.length);
    expect(getHeaderField(parseHeadersDat(full).get(0x80), 'Subject')).toBe('█');
  });
});

describe('serializeHeadersDat', () => {
  it('emits colon-form sections keyed by hex offset', () => {
    const text = serializeHeadersDat([
      { offset: 0x80, fields: [['Message-ID', '<a@b>'], ['Subject', 'Long subject line here']] },
    ]);
    expect(text).toContain('[80]\r\n');
    expect(text).toContain('Message-ID: <a@b>\r\n');
    expect(text).toContain('Subject: Long subject line here\r\n');
  });

  it('round-trips through the parser', () => {
    const text = serializeHeadersDat([
      { offset: 0x100, fields: [['To', 'Recipient'], ['Subject', 'Hello']] },
    ]);
    const map = parseHeadersDat(encodeCp437(text));
    expect(getHeaderField(map.get(0x100), 'To')).toBe('Recipient');
    expect(getHeaderField(map.get(0x100), 'Subject')).toBe('Hello');
  });
});
