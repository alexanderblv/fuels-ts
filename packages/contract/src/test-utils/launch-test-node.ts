import type { Account, WalletUnlocked } from '@fuel-ts/account';
import { setupTestProviderAndWallets } from '@fuel-ts/account/test-utils';
import type {
  LaunchCustomProviderAndGetWalletsOptions,
  SetupTestProviderAndWalletsReturn,
} from '@fuel-ts/account/test-utils';
import { FuelError } from '@fuel-ts/errors';
import type { BytesLike } from '@fuel-ts/interfaces';
import type { Contract } from '@fuel-ts/program';
import type { SnapshotConfigs } from '@fuel-ts/utils';
import { readFileSync } from 'fs';
import * as path from 'path';
import { mergeDeepRight } from 'ramda';

import type { DeployContractOptions } from '../contract-factory';

interface ContractDeployer {
  deployContract(
    bytecode: BytesLike,
    wallet: Account,
    options?: DeployContractOptions
  ): Promise<Contract>;
}

interface DeployContractConfig {
  /**
   * Contract deployer object compatible with factories outputted of `pnpm fuels typegen`.
   */
  deployer: ContractDeployer;
  /**
   * Contract bytecode. It can be generated via `pnpm fuels typegen`.
   */
  bytecode: BytesLike;
  /**
   * Options for contract deployment taken from `ContractFactory`.
   */
  options?: DeployContractOptions;
  /**
   * Index of wallet to be used for deployment. Defaults to `0` (first wallet).
   */
  walletIndex?: number;
}

interface LaunchTestNodeOptions<TContractConfigs extends DeployContractConfig[]>
  extends LaunchCustomProviderAndGetWalletsOptions {
  /**
   * Pass in either the path to the contract's root directory to deploy the contract or use `DeployContractConfig` for more control.
   */
  deployContracts: TContractConfigs;
}
type TContracts<T extends DeployContractConfig[]> = {
  [K in keyof T]: Awaited<ReturnType<T[K]['deployer']['deployContract']>>;
};
interface LaunchTestNodeReturn<TFactories extends DeployContractConfig[]>
  extends SetupTestProviderAndWalletsReturn {
  contracts: TContracts<TFactories>;
}

function getChainSnapshot<TFactories extends DeployContractConfig[]>(
  nodeOptions: LaunchTestNodeOptions<TFactories>['nodeOptions']
) {
  let envChainMetadata: SnapshotConfigs['metadata'] | undefined;
  let chainConfig: SnapshotConfigs['chainConfig'] | undefined;
  let stateConfig: SnapshotConfigs['stateConfig'] | undefined;

  if (process.env.DEFAULT_CHAIN_SNAPSHOT_DIR) {
    const dirname = process.env.DEFAULT_CHAIN_SNAPSHOT_DIR;

    envChainMetadata = JSON.parse(
      readFileSync(path.join(dirname, 'metadata.json'), 'utf-8')
    ) as SnapshotConfigs['metadata'];

    chainConfig = JSON.parse(
      readFileSync(path.join(dirname, envChainMetadata.chain_config), 'utf-8')
    );

    stateConfig = JSON.parse(
      readFileSync(path.join(dirname, envChainMetadata.table_encoding.Json.filepath), 'utf-8')
    );
  }

  const obj = [envChainMetadata, chainConfig, stateConfig].reduce((acc, val, idx) => {
    if (val === undefined) {
      return acc;
    }
    switch (idx) {
      case 0:
        acc.metadata = val as SnapshotConfigs['metadata'];
        break;
      case 1:
        acc.chainConfig = val as SnapshotConfigs['chainConfig'];
        break;
      case 2:
        acc.stateConfig = val as SnapshotConfigs['stateConfig'];
        break;
      default:
        return acc;
    }
    return acc;
  }, {} as SnapshotConfigs);

  return mergeDeepRight(obj, nodeOptions?.snapshotConfig ?? {});
}

function getFuelCoreArgs<TFactories extends DeployContractConfig[]>(
  nodeOptions: LaunchTestNodeOptions<TFactories>['nodeOptions']
) {
  const envArgs = process.env.DEFAULT_FUEL_CORE_ARGS
    ? process.env.DEFAULT_FUEL_CORE_ARGS.split(' ')
    : undefined;

  return nodeOptions?.args ?? envArgs;
}

function getWalletForDeployment(config: DeployContractConfig, wallets: WalletUnlocked[]) {
  if (!config.walletIndex) {
    return wallets[0];
  }

  const validWalletIndex = config.walletIndex >= 0 && config.walletIndex < wallets.length;

  if (!validWalletIndex) {
    throw new FuelError(
      FuelError.CODES.INVALID_INPUT_PARAMETERS,
      `Invalid walletIndex ${config.walletIndex}; wallets array contains ${wallets.length} elements.`
    );
  }

  return wallets[config.walletIndex];
}

export async function launchTestNode<TFactories extends DeployContractConfig[]>({
  providerOptions = {},
  walletConfig = {},
  nodeOptions = {},
  // @ts-expect-error asd
  deployContracts = [],
}: Partial<LaunchTestNodeOptions<TFactories>> = {}): Promise<LaunchTestNodeReturn<TFactories>> {
  const snapshotConfig = getChainSnapshot(nodeOptions);
  const args = getFuelCoreArgs(nodeOptions);
  const { provider, wallets, cleanup } = await setupTestProviderAndWallets({
    walletConfig,
    providerOptions,
    nodeOptions: {
      ...nodeOptions,
      snapshotConfig,
      args,
    },
  });

  let contracts: TContracts<TFactories>;
  try {
    contracts = (await Promise.all(
      deployContracts.map(async (config) =>
        config.deployer.deployContract(
          config.bytecode,
          getWalletForDeployment(config, wallets),
          config.options ?? {}
        )
      )
    )) as TContracts<TFactories>;
  } catch (err) {
    cleanup();
    throw err;
  }
  return {
    provider,
    wallets,
    contracts,
    cleanup,
    [Symbol.dispose]: cleanup,
  };
}
