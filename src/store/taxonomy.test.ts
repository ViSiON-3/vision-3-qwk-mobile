import {
  buildTaxonomy,
  areaIdForConference,
  areasForConference,
  areaByQwkConference,
  PRIVATE_CONFERENCE,
  UNGROUPED_CONFERENCE_NAME,
} from './taxonomy';
import type { AreaIndex } from '../qwk/areaIndex';

const CONTROL = [
  { number: 0, name: 'Private Mail' },
  { number: 1, name: 'General Discussion' },
  { number: 3, name: 'General' },
  { number: 4, name: 'BBS Ads' },
  { number: 6, name: 'Development' },
  { number: 9, name: 'LORD: Legend of the Red Dragon' },
];

const INDEX: AreaIndex = {
  version: 1,
  conferences: [
    { tag: 'FSXNET', name: 'fsxNet' },
    { tag: 'LOCAL', name: 'Local Areas' },
    { tag: 'V3NET', name: 'V3Net' },
    { tag: 'EMPTY', name: 'Nothing exported here' },
  ],
  areas: [
    { qwk: 0, tag: 'PRIVMAIL', name: 'Private Mail', conference: 'LOCAL', type: 'local' },
    { qwk: 1, tag: 'GENERAL', name: 'General Discussion', conference: 'LOCAL', type: 'local' },
    { qwk: 3, tag: 'FSX_GEN', name: 'General', conference: 'FSXNET', type: 'echomail', network: 'fsxnet' },
    { qwk: 4, tag: 'FSX_ADS', name: 'BBS Ads', conference: 'FSXNET', type: 'echomail', network: 'fsxnet' },
    { qwk: 6, tag: 'V3_DEV', name: 'Development', conference: 'V3NET', type: 'v3net' },
    { qwk: 9, tag: 'LORD', name: 'LORD: Legend of the Red Dragon', type: 'echomail', network: 'fidonet' },
  ],
};

describe('buildTaxonomy with the V3AREAS.JSON index', () => {
  const { conferences, areas } = buildTaxonomy(CONTROL, INDEX);

  it('skips conference 0 (private mail)', () => {
    expect(areas.some((a) => a.qwkConference === PRIVATE_CONFERENCE)).toBe(false);
    expect(areaByQwkConference(areas, 0)).toBeUndefined();
  });

  it('maps each conference to an area with a stable `a<number>` id and the board tag', () => {
    expect(areaIdForConference(3)).toBe('a3');
    const a3 = areaByQwkConference(areas, 3);
    expect(a3?.id).toBe('a3');
    expect(a3?.name).toBe('General');
    expect(a3?.tag).toBe('FSX_GEN');
  });

  it('groups areas under the board conferences, in board order, dropping empty ones', () => {
    expect(conferences.map((c) => c.name)).toEqual(['fsxNet', 'Local Areas', 'V3Net', UNGROUPED_CONFERENCE_NAME]);
    expect(conferences.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3']);
    const fsx = conferences[0];
    expect(fsx.tag).toBe('FSXNET');
    expect(areasForConference(areas, fsx.id).map((a) => a.qwkConference)).toEqual([3, 4]);
    expect(areasForConference(areas, fsx.id).map((a) => a.number)).toEqual([1, 2]);
  });

  it('flags a conference as networked when any of its areas is fed by a network', () => {
    expect(conferences.find((c) => c.name === 'fsxNet')?.isNet).toBe(true);
    expect(conferences.find((c) => c.name === 'V3Net')?.isNet).toBe(true);
    expect(conferences.find((c) => c.name === 'Local Areas')?.isNet).toBe(false);
  });

  it('never parses area names: a colon in a name does not invent a conference', () => {
    expect(conferences.some((c) => c.name === 'LORD')).toBe(false);
    const lord = areaByQwkConference(areas, 9)!;
    expect(lord.name).toBe('LORD: Legend of the Red Dragon');
    expect(lord.tag).toBe('LORD');
  });

  it('files ungrouped areas (and areas the index does not know) under the fallback bucket', () => {
    const fallback = conferences[conferences.length - 1];
    expect(fallback.name).toBe(UNGROUPED_CONFERENCE_NAME);
    expect(fallback.isNet).toBe(false);
    expect(areasForConference(areas, fallback.id).map((a) => a.qwkConference)).toEqual([9]);

    const { conferences: cs, areas: as } = buildTaxonomy(
      [...CONTROL, { number: 42, name: 'Not in index' }],
      INDEX
    );
    expect(areasForConference(as, cs[cs.length - 1].id).map((a) => a.qwkConference)).toEqual([9, 42]);
    expect(areaByQwkConference(as, 42)?.tag).toBe('NOT_IN_INDEX');
  });

  it('ignores an area whose parent conference is not in the index conference list', () => {
    const idx: AreaIndex = {
      version: 1,
      conferences: [],
      areas: [{ qwk: 1, tag: 'GENERAL', name: 'General Discussion', conference: 'GHOST' }],
    };
    const { conferences: cs } = buildTaxonomy(CONTROL.slice(0, 2), idx);
    expect(cs).toHaveLength(1);
    expect(cs[0].name).toBe(UNGROUPED_CONFERENCE_NAME);
  });
});

describe('buildTaxonomy without an index (older server)', () => {
  const { conferences, areas } = buildTaxonomy(CONTROL);

  it('puts every public area under one flat fallback conference', () => {
    expect(conferences).toHaveLength(1);
    expect(conferences[0].name).toBe(UNGROUPED_CONFERENCE_NAME);
    expect(conferences[0].tag).toBe('LOCAL');
    expect(conferences[0].isNet).toBe(false);
    expect(areasForConference(areas, conferences[0].id).map((a) => a.qwkConference)).toEqual([1, 3, 4, 6, 9]);
  });

  it('keeps area names verbatim and derives tags from them', () => {
    expect(areaByQwkConference(areas, 9)?.name).toBe('LORD: Legend of the Red Dragon');
    expect(areaByQwkConference(areas, 1)?.tag).toBe('GENERAL_DISC');
  });

  it('dedupes repeated conference numbers (first name wins)', () => {
    const { areas: a2 } = buildTaxonomy([
      { number: 1, name: 'First' },
      { number: 1, name: 'Second' },
    ]);
    expect(a2).toHaveLength(1);
    expect(a2[0].name).toBe('First');
  });

  it('returns empty taxonomy for an empty or private-only directory', () => {
    expect(buildTaxonomy([]).areas).toHaveLength(0);
    expect(buildTaxonomy([]).conferences).toHaveLength(0);
    expect(buildTaxonomy([{ number: 0, name: 'Personal' }]).conferences).toHaveLength(0);
  });
});
