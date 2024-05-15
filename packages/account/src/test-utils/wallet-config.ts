import { randomBytes } from '@fuel-ts/crypto';
import { FuelError } from '@fuel-ts/errors';
import { defaultSnapshotConfigs, hexlify, type SnapshotConfigs } from '@fuel-ts/utils';
import type { PartialDeep } from 'type-fest';

import { WalletUnlocked } from '../wallet';

import { AssetId } from './asset-id';
import type { TestMessage } from './test-message';

export interface WalletConfigOptions {
  /**
   * Number of wallets to generate.
   */
  count: number;

  /**
   * If `number`, the number of unique asset ids each wallet will own.
   *
   * If `AssetId[]`, the asset ids the each wallet will own besides `AssetId.BaseAssetId`.
   */
  assets: number | AssetId[];

  /**
   * Number of coins (UTXOs) per asset id.
   */
  coinsPerAsset: number;

  /**
   * For each coin, the amount it'll contain.
   */
  amountPerCoin: number;

  /**
   * Messages that are supposed to be on the wallet.
   * The `recipient` field of the message is overriden to be the wallet's address.
   */
  messages: TestMessage[];
}

/**
 * Used for configuring the wallets that should exist in the genesis block of a test node.
 */
export class WalletConfig {
  private initialState: SnapshotConfigs['stateConfig'];
  private options: WalletConfigOptions;
  public wallets: WalletUnlocked[];

  private generateWallets: () => WalletUnlocked[] = () => {
    const generatedWallets: WalletUnlocked[] = [];
    for (let index = 1; index <= this.options.count; index++) {
      generatedWallets.push(new WalletUnlocked(randomBytes(32)));
    }
    return generatedWallets;
  };

  constructor(baseAssetId: string, config: WalletConfigOptions) {
    const BASE_ASSET_ID = baseAssetId.startsWith('0x') ? baseAssetId : `0x${baseAssetId}`;
    WalletConfig.guard(config);

    this.options = config;

    const { assets, coinsPerAsset, amountPerCoin, messages } = this.options;
    this.wallets = this.generateWallets();
    this.initialState = {
      messages: WalletConfig.createMessages(this.wallets, messages),
      coins: WalletConfig.createCoins(
        this.wallets,
        BASE_ASSET_ID,
        assets,
        coinsPerAsset,
        amountPerCoin
      ),
    };
  }

  apply(snapshotConfig: PartialDeep<SnapshotConfigs> | undefined): PartialDeep<SnapshotConfigs> & {
    stateConfig: { coins: SnapshotConfigs['stateConfig']['coins'] };
  } {
    return {
      ...snapshotConfig,
      stateConfig: {
        ...(snapshotConfig?.stateConfig ?? defaultSnapshotConfigs.stateConfig),
        coins: this.initialState.coins.concat(snapshotConfig?.stateConfig?.coins || []),
        messages: this.initialState.messages.concat(snapshotConfig?.stateConfig?.messages ?? []),
      },
    };
  }

  private static createMessages(wallets: WalletUnlocked[], messages: TestMessage[]) {
    return messages
      .map((msg) => wallets.map((wallet) => msg.toChainMessage(wallet.address)))
      .flatMap((x) => x);
  }

  private static createCoins(
    wallets: WalletUnlocked[],
    baseAssetId: string,
    assets: number | AssetId[],
    coinsPerAsset: number,
    amountPerCoin: number
  ) {
    const coins: SnapshotConfigs['stateConfig']['coins'] = [];

    let assetIds: string[] = [baseAssetId];
    if (Array.isArray(assets)) {
      assetIds = assetIds.concat(assets.map((a) => a.value));
    } else {
      for (let index = 0; index < assets - 1; index++) {
        assetIds.push(AssetId.random().value);
      }
    }

    wallets
      .map((wallet) => wallet.address.toHexString())
      .forEach((walletAddress) => {
        assetIds.forEach((assetId) => {
          for (let index = 0; index < coinsPerAsset; index++) {
            coins.push({
              amount: amountPerCoin,
              asset_id: assetId,
              owner: walletAddress,
              tx_pointer_block_height: 0,
              tx_pointer_tx_idx: 0,
              output_index: 0,
              tx_id: hexlify(randomBytes(32)),
            });
          }
        });
      });

    return coins;
  }

  private static guard({
    count: wallets,
    assets,
    coinsPerAsset,
    amountPerCoin,
  }: WalletConfigOptions) {
    if (
      (Array.isArray(wallets) && wallets.length === 0) ||
      (typeof wallets === 'number' && wallets <= 0)
    ) {
      throw new FuelError(
        FuelError.CODES.INVALID_INPUT_PARAMETERS,
        'Number of wallets must be greater than zero.'
      );
    }
    if (
      (Array.isArray(assets) && assets.length === 0) ||
      (typeof assets === 'number' && assets <= 0)
    ) {
      throw new FuelError(
        FuelError.CODES.INVALID_INPUT_PARAMETERS,
        'Number of assets per wallet must be greater than zero.'
      );
    }
    if (coinsPerAsset <= 0) {
      throw new FuelError(
        FuelError.CODES.INVALID_INPUT_PARAMETERS,
        'Number of coins per asset must be greater than zero.'
      );
    }
    if (amountPerCoin <= 0) {
      throw new FuelError(
        FuelError.CODES.INVALID_INPUT_PARAMETERS,
        'Amount per coin must be greater than zero.'
      );
    }
  }
}
