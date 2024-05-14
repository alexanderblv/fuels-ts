import { generateTestWallet } from '@fuel-ts/account/test-utils';
import { urlIsLive } from '@fuel-ts/utils/test-utils';
import { FUEL_NETWORK_URL, Provider, TransactionResponse, Wallet } from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import { getSetupContract } from './utils';

/**
 * @group node
 */
describe('Edge Cases', () => {
  it.skip('can run collision_in_fn_names', async () => {
    const contract = await getSetupContract('collision_in_fn_names')();

    expect((await contract.functions.new().call()).value.toNumber()).toEqual(12345);
  });

  test('just to have a test', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    {
      using launched = await launchTestNode();
      const { provider } = launched;
      expect(await urlIsLive(provider.url)).toBeTruthy();
    }

    console.log(fetchSpy.mock.calls.map(([url, req]) => url));
  });

  test.skip("SSE subscriptions that are closed by the node don't hang a for-await-of loop", async () => {
    const provider = await Provider.create(FUEL_NETWORK_URL);
    const baseAssetId = provider.getBaseAssetId();
    const adminWallet = await generateTestWallet(provider, [[500_000, baseAssetId]]);

    const destination = Wallet.generate({
      provider,
    });

    const { id: transactionId } = await adminWallet.transfer(
      destination.address,
      100,
      baseAssetId,
      { gasLimit: 10_000 }
    );

    const response = new TransactionResponse(transactionId, provider);

    await response.waitForResult();

    const subsciption = provider.operations.statusChange({ transactionId });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const iterator of subsciption) {
      // we leave this intentionally empty so that we test that the subscription will end the loop when the connection is closed
    }
  });
});
