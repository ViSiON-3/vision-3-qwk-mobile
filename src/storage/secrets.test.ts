import { getBoardPassword, setBoardPassword, deleteBoardPassword } from './secrets';

// In Node/jest the native SecureStore module is unavailable; the wrapper must
// degrade gracefully (no throws, '' on read) rather than crash the store.
describe('secrets (no native module)', () => {
  it('does not throw and returns empty on read', async () => {
    await expect(setBoardPassword('b1', 'hunter2')).resolves.toBeUndefined();
    await expect(getBoardPassword('b1')).resolves.toBe('');
    await expect(deleteBoardPassword('b1')).resolves.toBeUndefined();
  });
});
