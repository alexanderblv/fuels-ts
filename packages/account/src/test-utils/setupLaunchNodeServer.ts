import http from 'http';

import type { LaunchNodeResult } from './launchNode';
import { launchNode } from './launchNode';

const cleanupFns: Map<string, Awaited<LaunchNodeResult>['cleanup']> = new Map();

function cleanupAllNodes() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns.clear();
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log(req.url);
  if (req.url === '/') {
    const node = await launchNode({ loggingEnabled: false, port: '0' });
    cleanupFns.set(node.url, node.cleanup);
    // const response = JSON.stringify({
    //   url: node.url,
    // });
    // console.log(response);
    res.write(node.url);
    res.end();
    return;
  }

  if (req.url === '/cleanup-all') {
    cleanupAllNodes();
    res.end();
  }

  if (req.url?.startsWith('/cleanup')) {
    const nodeUrl = req.url?.match(/\/cleanup\/(.+)/)?.[1];
    console.log(nodeUrl);
    if (nodeUrl) {
      const cleanupFn = cleanupFns.get(nodeUrl);
      console.log(cleanupFn);
      if (cleanupFn) {
        cleanupFn();
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
  console.log("To launch a new fuel-core node and get its url, make a request to '/'.");
  console.log(
    "To kill the node, make a request to '/cleanup/<url>' where <url> is the url of the node you want to kill."
  );
  console.log("To kill all nodes, make a request to '/cleanup-all'.");
});

server.on('close', cleanupAllNodes);

process.on('exit', cleanupAllNodes);
process.on('SIGINT', cleanupAllNodes);
process.on('SIGUSR1', cleanupAllNodes);
process.on('SIGUSR2', cleanupAllNodes);
process.on('uncaughtException', cleanupAllNodes);
process.on('unhandledRejection', cleanupAllNodes);
process.on('beforeExit', cleanupAllNodes);
