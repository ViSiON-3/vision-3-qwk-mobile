import { parseControlDat } from './control';
import { controlDat } from './testFixtures';
import { encodeCp437 } from './cp437';
import { concatBytes } from './bytes';

describe('parseControlDat', () => {
  it('parses BBS metadata and the serial,BBSID line', () => {
    const bytes = controlDat({
      bbsName: 'ViSiON/3',
      serial: '12345',
      bbsId: 'V3BBS',
      username: 'JANE DOE',
      conferences: [{ number: 0, name: 'Main Board' }],
    });
    const c = parseControlDat(bytes);
    expect(c.bbsName).toBe('ViSiON/3');
    expect(c.serial).toBe('12345');
    expect(c.bbsId).toBe('V3BBS');
    expect(c.username).toBe('JANE DOE');
  });

  it('applies conferenceCount = line11 + 1 and reads pairs', () => {
    const bytes = controlDat({
      conferences: [
        { number: 0, name: 'Local' },
        { number: 5, name: 'fsxNet' },
        { number: 12, name: 'FidoNet' },
      ],
      welcome: 'HELLO',
      news: 'BULLETIN',
      goodbye: 'BYE',
    });
    const c = parseControlDat(bytes);
    expect(c.conferences).toEqual([
      { number: 0, name: 'Local' },
      { number: 5, name: 'fsxNet' },
      { number: 12, name: 'FidoNet' },
    ]);
    expect(c.welcomeFile).toBe('HELLO');
    expect(c.newsFile).toBe('BULLETIN');
    expect(c.goodbyeFile).toBe('BYE');
  });

  it('ignores trailing door-specific junk after screen files', () => {
    const base = controlDat({ conferences: [{ number: 0, name: 'Main' }] });
    const withJunk = concatBytes([base, encodeCp437('EXTRA STAT LINE\r\nANOTHER\r\n')]);
    const c = parseControlDat(withJunk);
    expect(c.conferences).toHaveLength(1);
    expect(c.bbsId).toBe('V3TEST');
  });

  it('caps a hostile/corrupt conference count to available lines (no unbounded loop)', () => {
    // A malicious CONTROL.DAT claims ~1e9 conferences but supplies only two pairs.
    const raw = encodeCp437(
      ['BBS', 'City', 'Phone', 'Sysop', '1,ID', 'date', 'USER', '', '0', '0', '999999999', '0', 'Main', '1', 'Net'].join('\n')
    );
    const c = parseControlDat(raw);
    expect(c.conferences.length).toBeLessThanOrEqual(2);
    expect(c.conferences[0]).toEqual({ number: 0, name: 'Main' });
  });

  it('tolerates bare LF line endings', () => {
    const lf = encodeCp437(
      ['BBS', 'City', 'Phone', 'Sysop', '1,ID', 'date', 'USER', '', '0', '1', '0', '0', 'Main', 'W', 'N', 'G'].join('\n')
    );
    const c = parseControlDat(lf);
    expect(c.bbsId).toBe('ID');
    expect(c.conferences).toEqual([{ number: 0, name: 'Main' }]);
  });
});
