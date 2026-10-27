import { purgeLegacyBoardPassword } from './secrets';

// In Node/jest the native SecureStore module is unavailable; the wrapper must
// degrade gracefully (no throws) rather than crash hydration.
describe('secrets (no native module)', () => {
  it('purging a legacy password does not throw', async () => {
    await expect(purgeLegacyBoardPassword('b1')).resolves.toBeUndefined();
  });
});
