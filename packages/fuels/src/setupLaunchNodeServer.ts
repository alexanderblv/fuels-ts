import type { LaunchNodeOptions, LaunchNodeResult } from '@fuel-ts/account/test-utils';
import { launchNode } from '@fuel-ts/account/test-utils';
import http from 'http';

const cleanupFns: Map<string, Awaited<LaunchNodeResult>['cleanup']> = new Map();

function cleanupAllNodes() {
  console.log('cleaning up');
  cleanupFns.forEach((fn) => fn());
  cleanupFns.clear();
}

process.setMaxListeners(10000);

async function parseBody(req: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const body: Buffer[] = [];
    req.on('data', (chunk) => {
      body.push(chunk);
    });
    req.on('end', () => {
      resolve(JSON.parse(Buffer.concat(body).toString()));
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/') {
    const body = (await parseBody(req)) as LaunchNodeOptions;

    const node = await launchNode(body);
    cleanupFns.set(node.url, node.cleanup);
    res.write(node.url);
    res.end();
    return;
  }

  if (req.url === '/cleanup-all') {
    cleanupAllNodes();
    res.end();
    return;
  }

  if (req.url?.startsWith('/cleanup')) {
    const nodeUrl = req.url?.match(/\/cleanup\/(.+)/)?.[1];
    if (nodeUrl) {
      const cleanupFn = cleanupFns.get(nodeUrl);
      if (cleanupFn) {
        cleanupFn();
        cleanupFns.delete(nodeUrl);
      }
      res.end();
    }
  }
});

const port = process.argv[2] ? parseInt(process.argv[2], 10) : 49342;

server.listen(port);

server.on('listening', () => {
  const serverUrl = `http://localhost:${port}`;
  console.log(`Server is listening on: ${serverUrl}`);
  console.log("To launch a new fuel-core node and get its url, make a POST request to '/'.");
  console.log(
    "To kill the node, make a POST request to '/cleanup/<url>' where <url> is the url of the node you want to kill."
  );
  console.log("To kill all nodes, make a request to '/cleanup-all'.");
});

server.on('close', () => {
  console.log('close');
  cleanupAllNodes();
});

process.on('exit', () => {
  console.log('exit');
  cleanupAllNodes();
});
process.on('SIGINT', cleanupAllNodes);
process.on('SIGUSR1', cleanupAllNodes);
process.on('SIGUSR2', cleanupAllNodes);
process.on('uncaughtException', (rr) => {
  console.log(rr);
  console.log('uncaughtException');
  cleanupAllNodes();
});
process.on('unhandledRejection', cleanupAllNodes);
process.on('beforeExit', cleanupAllNodes);
