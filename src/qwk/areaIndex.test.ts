import { parseAreaIndex, serializeAreaIndex, AREA_INDEX_VERSION, AreaIndex } from './areaIndex';
import { encodeUtf8 } from './utf8';

const SAMPLE: AreaIndex = {
  version: 1,
  conferences: [{ tag: 'FSXNET', name: 'fsxNet' }],
  areas: [
    { qwk: 0, tag: 'PRIVMAIL', name: 'Private Mail', type: 'local' },
    { qwk: 5, tag: 'FSX_GEN', name: 'General', conference: 'FSXNET', type: 'echomail', network: 'fsxnet' },
  ],
};

describe('parseAreaIndex', () => {
  it('round-trips through serializeAreaIndex', () => {
    const parsed = parseAreaIndex(serializeAreaIndex(SAMPLE));
    expect(parsed).toEqual({ ...SAMPLE, version: AREA_INDEX_VERSION });
  });

  it('reads the exact JSON the server writes (omitted optional fields)', () => {
    const json = `{
  "version": 1,
  "conferences": [{ "tag": "LOCAL", "name": "Local Areas" }],
  "areas": [
    { "qwk": 1, "tag": "GENERAL", "name": "General Discussion", "conference": "LOCAL", "type": "local" },
    { "qwk": 9, "tag": "LORD", "name": "LORD: Legend of the Red Dragon", "type": "echomail", "network": "fidonet" }
  ]
}`;
    const idx = parseAreaIndex(encodeUtf8(json))!;
    expect(idx.conferences).toEqual([{ tag: 'LOCAL', name: 'Local Areas' }]);
    expect(idx.areas[1]).toEqual({
      qwk: 9,
      tag: 'LORD',
      name: 'LORD: Legend of the Red Dragon',
      conference: undefined,
      type: 'echomail',
      network: 'fidonet',
      networkName: undefined,
    });
  });

  it('decodes UTF-8 names', () => {
    const idx = parseAreaIndex(encodeUtf8('{"version":1,"conferences":[],"areas":[{"qwk":2,"tag":"T","name":"Café ☕"}]}'))!;
    expect(idx.areas[0].name).toBe('Café ☕');
  });

  it('drops malformed entries and duplicates but keeps the rest', () => {
    const idx = parseAreaIndex(
      encodeUtf8(
        JSON.stringify({
          version: 1,
          conferences: [{ tag: 'A', name: 'A' }, { name: 'no tag' }, 'junk', { tag: 'A', name: 'dup' }],
          areas: [{ qwk: 1, tag: 'X', name: 'X' }, { qwk: '1' }, { qwk: -1 }, { qwk: 1, name: 'dup' }, null],
        })
      )
    )!;
    expect(idx.conferences).toEqual([{ tag: 'A', name: 'A' }]);
    expect(idx.areas.map((a) => a.qwk)).toEqual([1]);
  });

  it('returns undefined for non-JSON or an unrelated object', () => {
    expect(parseAreaIndex(encodeUtf8('not json'))).toBeUndefined();
    expect(parseAreaIndex(encodeUtf8('[]'))).toBeUndefined();
    expect(parseAreaIndex(encodeUtf8('{"foo":1}'))).toBeUndefined();
    expect(parseAreaIndex(new Uint8Array(0))).toBeUndefined();
  });
});
