import {
  buildTaxonomy,
  areaIdForConference,
  areasForConference,
  areaByQwkConference,
  PRIVATE_CONFERENCE,
  UNGROUPED_CONFERENCE_NAME,
  FLAT_CONFERENCE_NAME,
  networkDisplayName,
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
    { qwk: 11, tag: 'FIDO_ADS', name: 'Fido Ads', type: 'echomail', network: 'fidonet' },
    { qwk: 12, tag: 'ORPHAN', name: 'Orphan', type: 'local' },
  ],
};
const CONTROL_ALL = [...CONTROL, { number: 11, name: 'Fido Ads' }, { number: 12, name: 'Orphan' }];

describe('buildTaxonomy with the V3AREAS.JSON index', () => {
  const { conferences, areas } = buildTaxonomy(CONTROL_ALL, INDEX);

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

  it('orders board conferences first (board order, empty ones dropped), then network groups, then Other Areas', () => {
    expect(conferences.map((c) => c.name)).toEqual(['fsxNet', 'Local Areas', 'V3Net', 'FidoNet', UNGROUPED_CONFERENCE_NAME]);
    expect(conferences.map((c) => c.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
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

  it('groups areas the board left ungrouped by their network, as a networked conference', () => {
    const fido = conferences.find((c) => c.name === 'FidoNet')!;
    expect(fido.tag).toBe('FIDONET');
    expect(fido.isNet).toBe(true);
    expect(areasForConference(areas, fido.id).map((a) => a.qwkConference)).toEqual([9, 11]);
    // The board's real "Local Areas" conference is untouched by the fallback.
    expect(conferences.filter((c) => c.name === 'Local Areas')).toHaveLength(1);
    expect(conferences.some((c) => c.name === 'Local')).toBe(false);
  });

  it('files ungrouped areas with no network (and areas the index does not know) under Other Areas', () => {
    const other = conferences[conferences.length - 1];
    expect(other.name).toBe(UNGROUPED_CONFERENCE_NAME);
    expect(other.tag).toBe('OTHER');
    expect(other.isNet).toBe(false);
    expect(areasForConference(areas, other.id).map((a) => a.qwkConference)).toEqual([12]);

    const { conferences: cs, areas: as } = buildTaxonomy(
      [...CONTROL_ALL, { number: 42, name: 'Not in index' }],
      INDEX
    );
    expect(areasForConference(as, cs[cs.length - 1].id).map((a) => a.qwkConference)).toEqual([12, 42]);
    expect(areaByQwkConference(as, 42)?.tag).toBe('NOT_IN_INDEX');
  });

  it('prefers a server-provided network name over the cosmetic default', () => {
    const idx: AreaIndex = {
      version: 1,
      conferences: [],
      areas: [{ qwk: 1, tag: 'X', name: 'X', type: 'qwknet', network: 'dove', networkName: 'DOVE-Net (VERT)' }],
    };
    const { conferences: cs } = buildTaxonomy(CONTROL.slice(0, 2), idx);
    expect(cs.map((c) => c.name)).toEqual(['DOVE-Net (VERT)']);
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
    expect(conferences[0].name).toBe(FLAT_CONFERENCE_NAME);
    expect(conferences[0].tag).toBe('ALL');
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

describe('networkDisplayName', () => {
  it('uses known casing, a generic *Net rule, or capitalises the key', () => {
    expect(networkDisplayName('fsxnet')).toBe('fsxNet');
    expect(networkDisplayName('FIDONET')).toBe('FidoNet');
    expect(networkDisplayName('dovenet')).toBe('DOVE-Net');
    expect(networkDisplayName('sportnet')).toBe('SportNet');
    expect(networkDisplayName('araknet')).toBe('ArakNet');
    expect(networkDisplayName('agora')).toBe('Agora');
    expect(networkDisplayName('fsxnet', 'Custom')).toBe('Custom');
  });
});
