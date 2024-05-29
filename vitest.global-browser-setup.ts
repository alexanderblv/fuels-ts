import { spawn } from 'node:child_process';

export default async function setup() {
  return new Promise((resolve, reject) => {
    const cp = spawn('pnpm tsx packages/fuels/src/setupLaunchNodeServer.ts', {
      detached: true,
      shell: 'sh',
    });

    cp.stdout?.on('data', () => {
      // teardown
      resolve(() => {
        // https://github.com/nodejs/node/issues/2098#issuecomment-169549789
        process.kill(-cp.pid!);
      });
    });

    cp.on('error', (err) => {
      console.log('failed to start launchNode server', err);
      reject();
    });
  });
}
