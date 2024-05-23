import { ASSET_A } from '@fuel-ts/utils/test-utils';
import type { Contract } from 'fuels';
import { BN, bn, toHex } from 'fuels';
import { launchTestNode } from 'fuels/test-utils';

import { CallTestContractAbi__factory } from '../test/typegen/contracts';
import binHexlified from '../test/typegen/contracts/CallTestContractAbi.hex';

const U64_MAX = bn(2).pow(64).sub(1);

/**
 * @group node
 * @group browser
 */
describe('CallTestContract', () => {
  it.each([0, 1337, U64_MAX.sub(1)])('can call a contract with u64 (%p)', async (num) => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;
    const { value } = await contract.functions.foo(num).call();
    expect(value.toHex()).toEqual(bn(num).add(1).toHex());
  });

  it.each([
    [{ a: false, b: 0 }],
    [{ a: true, b: 0 }],
    [{ a: false, b: 1337 }],
    [{ a: true, b: 1337 }],
    [{ a: false, b: U64_MAX.sub(1) }],
    [{ a: true, b: U64_MAX.sub(1) }],
  ])('can call a contract with structs (%p)', async (struct) => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;
    const { value } = await contract.functions.boo(struct).call();
    expect(value.a).toEqual(!struct.a);
    expect(value.b.toHex()).toEqual(bn(struct.b).add(1).toHex());
  });

  it('can call a function with empty arguments', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    const { value: empty } = await contract.functions.empty().call();
    expect(empty.toHex()).toEqual(toHex(63));

    const { value: emptyThenValue } = await contract.functions.empty_then_value(35).call();
    expect(emptyThenValue.toHex()).toEqual(toHex(63));

    const { value: valueThenEmpty } = await contract.functions.value_then_empty(35).call();
    expect(valueThenEmpty.toHex()).toEqual(toHex(63));

    const { value: valueThenEmptyThenValue } = await contract.functions
      .value_then_empty_then_value(35, 35)
      .call();
    expect(valueThenEmptyThenValue.toHex()).toEqual(toHex(63));
  });

  it('function with empty return should resolve undefined', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    // Call method with no params but with no result and no value on config
    const { value } = await contract.functions.return_void().call();
    expect(value).toEqual(undefined);
  });

  it.each([
    [
      'no_params',
      {
        values: [],
        expected: bn(50),
      },
    ],
    [
      'sum',
      {
        values: [10, 20],
        expected: bn(30),
      },
    ],
    [
      'sum_test',
      {
        values: [
          10,
          {
            a: 20,
            b: 30,
          },
        ],
        expected: bn(60),
      },
    ],
    [
      'sum_single',
      {
        values: [
          {
            a: 34,
            b: 34,
          },
        ],
        expected: bn(68),
      },
    ],
    [
      'sum_multparams',
      {
        values: [10, 10, 10, 10, 40],
        expected: bn(80),
      },
    ],
    [
      'add_ten',
      {
        values: [
          {
            a: 20,
          },
        ],
        expected: bn(30),
      },
    ],
    [
      'echo_b256',
      {
        values: ['0x0000000000000000000000000000000000000000000000000000000000000001'],
        expected: '0x0000000000000000000000000000000000000000000000000000000000000001',
      },
    ],
  ])(
    `Test call with multiple arguments and different types -> %s`,
    async (method, { values, expected }) => {
      // Type cast to Contract because of the dynamic nature of the test
      // But the function names are type-constrained to correct Contract's type
      using launched = await launchTestNode({
        deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
      });
      const {
        contracts: [contract],
      } = launched;

      const { value } = await (contract as Contract).functions[method](...values).call();

      if (BN.isBN(value)) {
        expect(toHex(value)).toBe(toHex(expected));
      } else {
        expect(value).toBe(expected);
      }
    }
  );

  it('Forward amount value on contract call', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    const baseAssetId = contract.provider.getBaseAssetId();
    const { value } = await contract.functions
      .return_context_amount()
      .callParams({
        forward: [1_000_000, baseAssetId],
      })
      .call();
    expect(value.toHex()).toBe(bn(1_000_000).toHex());
  });

  it('Forward asset_id on contract call', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    const assetId = ASSET_A;
    const { value } = await contract.functions
      .return_context_asset()
      .callParams({
        forward: [0, assetId],
      })
      .call();
    expect(value).toBe(assetId);
  });

  it('Forward asset_id on contract simulate call', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    const assetId = ASSET_A;
    const { value } = await contract.functions
      .return_context_asset()
      .callParams({
        forward: [0, assetId],
      })
      .call();
    expect(value).toBe(assetId);
  });

  it('can make multiple calls', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    const num = 1337;
    const numC = 10;
    const struct = { a: true, b: 1337 };
    const invocationA = contract.functions.foo(0);
    const multiCallScope = contract.multiCall([invocationA, contract.functions.boo(struct)]);

    // Set arguments of the invocation
    invocationA.setArguments(num);

    // Add invocation to multi-call
    const invocationC = contract.functions.foo(numC);
    multiCallScope.addCall(invocationC);

    async function expectContractCall() {
      // Submit multi-call transaction
      const {
        value: [resultA, resultB, resultC],
      } = await multiCallScope.call();

      expect(resultA.toHex()).toEqual(bn(num).add(1).toHex());
      expect(resultB.a).toEqual(!struct.a);
      expect(resultB.b.toHex()).toEqual(bn(struct.b).add(1).toHex());
      expect(resultC.toHex(0)).toEqual(bn(numC).add(1).toHex());
    }

    // Test first time
    await expectContractCall();
    // It should be possible to re-execute the
    // tx execution context
    await expectContractCall();
  });

  it('Calling a simple contract function does only one dry run', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    const dryRunSpy = vi.spyOn(contract.provider.operations, 'dryRun');
    await contract.functions.no_params().call();
    expect(dryRunSpy).toHaveBeenCalledOnce();
  });

  it('Simulating a simple contract function does two dry runs', async () => {
    using launched = await launchTestNode({
      deployContracts: [{ deployer: CallTestContractAbi__factory, bytecode: binHexlified }],
    });
    const {
      contracts: [contract],
    } = launched;

    const dryRunSpy = vi.spyOn(contract.provider.operations, 'dryRun');

    await contract.functions.no_params().simulate();
    expect(dryRunSpy).toHaveBeenCalledTimes(2);
  });
});
