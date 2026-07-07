import {
  buildTaxonomy,
  areaIdForConference,
  areasForConference,
  areaByQwkConference,
  PRIVATE_CONFERENCE,
} from './taxonomy';

describe('buildTaxonomy (server-driven from CONTROL.DAT)', () => {
  const { conferences, areas } = buildTaxonomy([
    { number: 0, name: 'Private Mail' },
    { number: 1, name: 'General Discussion' },
    { number: 3, name: 'fsxNet: General' },
    { number: 4, name: 'fsxNet: BBS Ads' },
    { number: 6, name: 'V3Net: Development' },
  ]);

  it('skips conference 0 (private mail)', () => {
    expect(areas.some((a) => a.qwkConference === PRIVATE_CONFERENCE)).toBe(false);
    expect(areaByQwkConference(areas, 0)).toBeUndefined();
  });

  it('maps each conference to an area with a stable `a<number>` id', () => {
    expect(areaIdForConference(3)).toBe('a3');
    const a3 = areaByQwkConference(areas, 3);
    expect(a3?.id).toBe('a3');
    expect(a3?.name).toBe('General'); // "fsxNet: General" -> area name after the colon
  });

  it('groups "Network: Area" names under a networked conference', () => {
    const fsx = conferences.find((c) => c.name === 'fsxNet');
    expect(fsx?.isNet).toBe(true);
    expect(areasForConference(areas, fsx!.id).map((a) => a.qwkConference).sort()).toEqual([3, 4]);
    // Area numbers are sequential within the conference.
    expect(areasForConference(areas, fsx!.id).map((a) => a.number)).toEqual([1, 2]);
  });

  it('files a bare conference name under a local (non-net) conference', () => {
    const local = conferences.find((c) => c.name === 'Local');
    expect(local?.isNet).toBe(false);
    expect(areasForConference(areas, local!.id).map((a) => a.name)).toEqual(['General Discussion']);
  });

  it('dedupes repeated conference numbers (first name wins)', () => {
    const { areas: a2 } = buildTaxonomy([
      { number: 1, name: 'First' },
      { number: 1, name: 'Second' },
    ]);
    expect(a2).toHaveLength(1);
    expect(a2[0].name).toBe('First');
  });

  it('does not merge the Local fallback with a network literally named "Local"', () => {
    const { conferences: cs, areas: as } = buildTaxonomy([
      { number: 1, name: 'General Discussion' }, // bare -> Local fallback
      { number: 2, name: 'Local: Chat' }, // real network named "Local"
    ]);
    expect(cs).toHaveLength(2);
    const fallback = cs.find((c) => !c.isNet)!;
    const net = cs.find((c) => c.isNet)!;
    expect(areasForConference(as, fallback.id).map((a) => a.name)).toEqual(['General Discussion']);
    expect(areasForConference(as, net.id).map((a) => a.name)).toEqual(['Chat']);
  });

  it('returns empty taxonomy for an empty or private-only directory', () => {
    expect(buildTaxonomy([]).areas).toHaveLength(0);
    expect(buildTaxonomy([{ number: 0, name: 'Personal' }]).conferences).toHaveLength(0);
  });
});
