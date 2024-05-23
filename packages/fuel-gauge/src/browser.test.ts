import { setupTestProviderAndWallets } from 'fuels/test-utils';

describe('browser', () => {
  it('should work', async () => {
    const asdf = await setupTestProviderAndWallets();

    asdf.cleanup();
  });
});
