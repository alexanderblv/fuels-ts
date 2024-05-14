import { startServer } from 'fuels/test-utils';
import type { GlobalSetupContext } from 'vitest/node';
// You can also extend `ProvidedContext` type
// to have type safe access to `provide/inject` methods:
declare module 'vitest' {
  export interface ProvidedContext {
    wsPort: number;
  }
}

let callback = () => {};
export async function setup({ provide }: GlobalSetupContext) {
  const { serverUrl, closeServerCallback } = await startServer();
  process.env.LAUNCH_NODE_SERVER_URL = serverUrl;
  callback = closeServerCallback;
}

export function teardown() {
  console.log('tearing down');
  callback();
}
