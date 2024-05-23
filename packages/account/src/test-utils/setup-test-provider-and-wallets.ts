import { defaultSnapshotConfigs, type SnapshotConfigs } from '@fuel-ts/utils';
import { mergeDeepRight } from 'ramda';
import type { PartialDeep } from 'type-fest';

import type { ProviderOptions } from '../providers';
import { Provider } from '../providers';
import type { WalletUnlocked } from '../wallet';

import { AssetId } from './asset-id';
import { launchNode } from './launchNode';
import { type LaunchNodeOptions } from './launchNode';
import type { WalletConfigOptions } from './wallet-config';
import { WalletConfig } from './wallet-config';

export interface LaunchCustomProviderAndGetWalletsOptions {
  /** Configures the wallets that should exist in the genesis block of the `fuel-core` node. */
  walletConfig?: Partial<WalletConfigOptions>;
  /** Options for configuring the provider. */
  providerOptions?: Partial<ProviderOptions>;
  /** Options for configuring the test node. */
  nodeOptions?: Partial<
    Omit<LaunchNodeOptions, 'snapshotConfig'> & {
      snapshotConfig: PartialDeep<SnapshotConfigs>;
    }
  >;
}

const defaultWalletConfigOptions: WalletConfigOptions = {
  count: 2,
  assets: [AssetId.A, AssetId.B],
  coinsPerAsset: 1,
  amountPerCoin: 10_000_000_000,
  messages: [],
};

export interface SetupTestProviderAndWalletsReturn extends Disposable {
  wallets: WalletUnlocked[];
  provider: Provider;
  cleanup: () => void;
}

/**
 * Launches a test node and creates wallets for testing.
 * If initialized with the `using` keyword, the node will be killed when it goes out of scope.
 * If initialized with `const`, manual disposal of the node must be done via the `cleanup` function.
 *
 * @param options - Options for configuring the wallets, provider, and test node.
 * @returns The wallets, provider and cleanup function that kills the node.
 *
 */
export async function setupTestProviderAndWallets({
  walletConfig: walletConfigOptions = {},
  providerOptions,
  nodeOptions = {},
}: Partial<LaunchCustomProviderAndGetWalletsOptions> = {}): Promise<SetupTestProviderAndWalletsReturn> {
  // @ts-expect-error this is a polyfill (see https://devblogs.microsoft.com/typescript/announcing-typescript-5-2/#using-declarations-and-explicit-resource-management)
  Symbol.dispose ??= Symbol('Symbol.dispose');
  const walletConfig = new WalletConfig(
    nodeOptions.snapshotConfig?.chainConfig?.consensus_parameters?.V1?.base_asset_id ??
      defaultSnapshotConfigs.chainConfig.consensus_parameters.V1.base_asset_id,
    {
      ...defaultWalletConfigOptions,
      ...walletConfigOptions,
    }
  );

  const launchNodeOptions = {
    loggingEnabled: false,
    ...nodeOptions,
    snapshotConfig: mergeDeepRight(
      defaultSnapshotConfigs,
      walletConfig.apply(nodeOptions?.snapshotConfig)
    ),
    port: '0',
  };

  let cleanup: () => void;
  let url: string;
  console.log('using server url', process.env.LAUNCH_NODE_SERVER_PORT);
  if (process.env.LAUNCH_NODE_SERVER_PORT) {
    const serverUrl = `http://localhost:${process.env.LAUNCH_NODE_SERVER_PORT}`;
    url = await (await fetch(serverUrl)).text();
    console.log('received url', url);
    cleanup = () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fetch(`${serverUrl}/cleanup/${url}`);
    };
  } else {
    const settings = await launchNode(launchNodeOptions);
    url = settings.url;
    cleanup = settings.cleanup;
  }

  let provider: Provider;

  try {
    provider = await Provider.create(url, providerOptions);
  } catch (err) {
    cleanup();
    throw err;
  }

  const wallets = walletConfig.wallets;
  wallets.forEach((wallet) => {
    wallet.connect(provider);
  });

  return {
    provider,
    wallets,
    cleanup,
    [Symbol.dispose]: cleanup,
  };
}
