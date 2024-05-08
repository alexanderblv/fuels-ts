import { randomBytes } from '@fuel-ts/crypto';
import { ErrorCode } from '@fuel-ts/errors';
import { expectToThrowFuelError, safeExec } from '@fuel-ts/errors/test-utils';
import type { AbstractAddress } from '@fuel-ts/interfaces';
import { bn, toNumber } from '@fuel-ts/math';
import { defaultSnapshotConfigs, hexlify } from '@fuel-ts/utils';
import { waitUntilUnreachable } from '@fuel-ts/utils/test-utils';

import { Provider } from '../providers';
import { Signer } from '../signer';
import { WalletUnlocked } from '../wallet';

import { AssetId } from './asset-id';
import * as launchNodeMod from './launchNode';
import { setupTestProviderAndWallets } from './setup-test-provider-and-wallets';
import { TestMessage } from './test-message';

const BaseAssetId = `0x${defaultSnapshotConfigs.chainConfigJson.consensus_parameters.V1.base_asset_id}`;
/**
 * @group node
 */
describe('setupTestProviderAndWallets', () => {
  it('kills the node after going out of scope', async () => {
    let url = '';
    // eslint-disable-next-line no-lone-blocks
    {
      using result = await setupTestProviderAndWallets();
      url = result.provider.url;
      await result.provider.getBlockNumber();
    }

    await waitUntilUnreachable(url);

    const { error } = await safeExec(async () => {
      const p = await Provider.create(url);
      return p.getBlockNumber();
    });

    expect(error).toMatchObject({
      message: 'fetch failed',
    });
  });

  test('kills the node if provider cant connect post-launch', async () => {
    const launchNodeSpy = vi.spyOn(launchNodeMod, 'launchNode');

    await expectToThrowFuelError(
      async () => {
        await setupTestProviderAndWallets({ providerOptions: { cacheUtxo: -500 } });
      },
      { code: ErrorCode.INVALID_TTL }
    );
    expect(launchNodeSpy).toHaveBeenCalled();
    const { url } = launchNodeSpy.mock.results[0].value as Awaited<launchNodeMod.LaunchNodeResult>;

    // test will timeout if the node isn't killed
    await waitUntilUnreachable(url);
  });

  it('can partially extend the default node configs', async () => {
    const coin = {
      owner: hexlify(randomBytes(32)),
      amount: 1234,
      asset_id: hexlify(randomBytes(32)),
      tx_id: hexlify(randomBytes(32)),
      output_index: 0,
      tx_pointer_block_height: 0,
      tx_pointer_tx_idx: 0,
    };
    using launched = await setupTestProviderAndWallets({
      nodeOptions: {
        snapshotConfig: {
          stateConfigJson: {
            coins: [coin],
          },
        },
      },
    });

    const { provider } = launched;

    const [sutCoin] = await provider.getCoins(
      { toB256: () => coin.owner } as AbstractAddress,
      coin.asset_id
    );

    expect(sutCoin.amount.toNumber()).toEqual(coin.amount);
    expect(sutCoin.owner.toB256()).toEqual(coin.owner);
    expect(sutCoin.assetId).toEqual(coin.asset_id);
    expect(sutCoin.txCreatedIdx.toNumber()).toEqual(coin.tx_pointer_tx_idx);
    expect(sutCoin.blockCreated.toNumber()).toEqual(coin.tx_pointer_block_height);
  });

  it('default: two wallets, three assets (BaseAssetId, AssetId.A, AssetId.B), one coin, 10_000_000_000_ amount', async () => {
    using providerAndWallets = await setupTestProviderAndWallets();
    const { wallets, provider } = providerAndWallets;

    expect(wallets.length).toBe(2);
    wallets.forEach((w) => expect(w.provider).toBe(provider));
    const [wallet1, wallet2] = wallets;
    const coins1 = await wallet1.getCoins();
    const coins2 = await wallet2.getCoins();

    expect(coins1.length).toBe(3);
    expect(
      coins1
        .sort((a, b) => (bn(a.assetId).gt(bn(b.assetId)) ? 1 : -1))
        .map((x) => [x.amount, x.assetId])
    ).toEqual(
      coins2
        .sort((a, b) => (bn(a.assetId).gt(bn(b.assetId)) ? 1 : -1))
        .map((x) => [x.amount, x.assetId])
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const baseAssetIdCoin = coins1.find((x) => x.assetId === BaseAssetId)!;

    expect(baseAssetIdCoin.assetId).toBe(BaseAssetId);
    expect(baseAssetIdCoin.amount.toNumber()).toBe(10_000_000_000);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const assetACoin = coins1.find((x) => x.assetId === AssetId.A.value)!;
    expect(assetACoin.amount.toNumber()).toBe(10_000_000_000);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const assetBCoin = coins1.find((x) => x.assetId === AssetId.B.value)!;
    expect(assetBCoin.amount.toNumber()).toBe(10_000_000_000);
  });

  it('can be given custom asset id and message', async () => {
    const assetId = AssetId.random();
    const testMessage = new TestMessage();
    using providerAndWallets = await setupTestProviderAndWallets({
      walletConfig: {
        count: 1,
        assets: [assetId],
        messages: [testMessage],
      },
    });

    const {
      wallets: [wallet],
    } = providerAndWallets;

    const coins = await wallet.getCoins();
    expect(coins.length).toBe(2);
    coins.sort((a, b) => (bn(a.assetId).gt(bn(b.assetId)) ? 1 : -1));

    const coin1 = coins[0];

    expect(coin1.assetId).toBe(BaseAssetId);
    expect(coin1.amount.toNumber()).toBe(10_000_000_000);

    const coin2 = coins[1];

    expect(coin2.assetId).toBe(assetId.value);
    expect(coin2.amount.toNumber()).toBe(10_000_000_000);

    const messages = await wallet.getMessages();
    expect(messages.length).toBe(1);

    const [message] = messages;
    const chainMessage = testMessage.toChainMessage(wallet.address);

    expect(message.amount.toNumber()).toEqual(chainMessage.amount);
    expect(message.recipient.toB256()).toEqual(chainMessage.recipient);
    expect(message.sender.toB256()).toEqual(chainMessage.sender);
    expect(toNumber(message.daHeight)).toEqual(toNumber(chainMessage.da_height));
    expect(message.data.toString()).toEqual(toNumber(chainMessage.data).toString());
    expect(message.nonce).toEqual(chainMessage.nonce);
  });

  it('can return multiple wallets with multiple assets, coins and amounts', async () => {
    const numWallets = 3;
    const numOfAssets = 5;
    const coinsPerAsset = 10;
    const amountPerCoin = 15;

    using providerAndWallets = await setupTestProviderAndWallets({
      walletConfig: {
        count: numWallets,
        assets: numOfAssets,
        coinsPerAsset,
        amountPerCoin,
      },
    });
    const { wallets } = providerAndWallets;

    expect(wallets.length).toBe(numWallets);

    const promises = wallets.map(async (wallet) => {
      const coins = await wallet.getCoins();
      expect(coins.length).toBe(numOfAssets * coinsPerAsset);

      coins
        .sort((coin) => (coin.assetId === BaseAssetId ? -1 : 1))
        .forEach((coin, index) => {
          if (index < coinsPerAsset) {
            expect(coin.assetId).toBe(BaseAssetId);
          } else {
            expect(coin.assetId).not.toBe(BaseAssetId);
            expect(coin.assetId).not.toBeFalsy();
          }
          expect(coin.amount.toNumber()).toBe(amountPerCoin);
        });
    });

    await Promise.all(promises);
  });

  test("gives control to add additional custom coins/messages to the genesis block without overriding walletConfig's settings", async () => {
    const pk = Signer.generatePrivateKey();
    const signer = new Signer(pk);
    const address = signer.address;

    const coin = {
      owner: address.toB256(),
      amount: 100,
      asset_id: BaseAssetId,
      tx_id: hexlify(randomBytes(32)),
      output_index: 0,
      tx_pointer_block_height: 0,
      tx_pointer_tx_idx: 0,
    };
    const message = new TestMessage({ recipient: signer.address }).toChainMessage();

    using providerAndWallets = await setupTestProviderAndWallets({
      nodeOptions: {
        snapshotConfig: {
          stateConfigJson: {
            coins: [coin],
            messages: [message],
          },
        },
      },
    });
    const { wallets, provider } = providerAndWallets;

    expect(wallets.length).toBe(2);
    const [wallet] = wallets;
    const coins = await wallet.getCoins();
    expect(coins.length).toBe(3);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const walletCoin = coins.find((c) => c.assetId === BaseAssetId)!;
    expect(walletCoin.assetId).toBe(BaseAssetId);
    expect(walletCoin.amount.toNumber()).toBe(10_000_000_000);

    const customWallet = new WalletUnlocked(pk, provider);
    const [customWalletCoin] = await customWallet.getCoins();
    const [customWalletMessage] = await customWallet.getMessages();

    expect(customWalletCoin.amount.toNumber()).toEqual(coin.amount);
    expect(customWalletCoin.owner.toB256()).toEqual(coin.owner);
    expect(customWalletCoin.assetId).toEqual(coin.asset_id);

    expect(customWalletMessage.amount.toNumber()).toEqual(message.amount);
    expect(customWalletMessage.recipient.toB256()).toEqual(message.recipient);
    expect(customWalletMessage.sender.toB256()).toEqual(message.sender);
    expect(toNumber(customWalletMessage.daHeight)).toEqual(toNumber(message.da_height));
    expect(customWalletMessage.data.toString()).toEqual(toNumber(message.data).toString());
    expect(customWalletMessage.nonce).toEqual(message.nonce);
  });
});
