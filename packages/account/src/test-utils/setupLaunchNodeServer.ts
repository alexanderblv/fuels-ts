import http from 'http';

import type { LaunchNodeResult } from './launchNode';
import { launchNode } from './launchNode';

const cleanupFns: Map<string, Awaited<LaunchNodeResult>['cleanup']> = new Map();

export const startServer = () =>
  new Promise<{ serverUrl: string; closeServerCallback: () => void }>((resolve) => {
    const server = http.createServer(async (req, res) => {
      if (req.url === '/') {
        const node = await launchNode({ loggingEnabled: false, port: '0' });
        cleanupFns.set(node.port, node.cleanup);
        res.write(
          JSON.stringify({
            url: node.url,
            port: node.port,
          })
        );
        res.end();
        return;
      }

      const port = req.url?.match(/\/cleanup\/(\d+)/)?.[1];
      if (port) {
        const cleanupFn = cleanupFns.get(port);

        if (cleanupFn) {
          cleanupFn();
        }
        res.end();
      }
    });

    server.listen(0);
    server.on('listening', () => {
      // @ts-expect-error doesnt know port exists
      const port = server.address()?.port;
      resolve({
        serverUrl: `http://localhost:${port}`,
        closeServerCallback: () => {
          //   cleanupFns.forEach((fn) => fn());
          server.close();
        },
      });
    });
  });
