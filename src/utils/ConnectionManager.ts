import { RevitClientConnection } from "./SocketClient.js";
import * as net from "net";

let connectionMutex: Promise<void> = Promise.resolve();

const PORT_START = 8080;
const PORT_END = 8099;

async function findRevitPort(): Promise<number> {
  for (let port = PORT_START; port <= PORT_END; port++) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(300);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "localhost");
    });
    if (isOpen) return port;
  }
  throw new Error(`No Revit MCP plugin found on ports ${PORT_START}-${PORT_END}`);
}

export async function withRevitConnection<T>(
  operation: (client: RevitClientConnection) => Promise<T>
): Promise<T> {
  const previousMutex = connectionMutex;
  let releaseMutex: () => void;
  connectionMutex = new Promise<void>((resolve) => {
    releaseMutex = resolve;
  });
  await previousMutex;

  const port = await findRevitPort();
  const revitClient = new RevitClientConnection("localhost", port);

  try {
    if (!revitClient.isConnected) {
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          revitClient.socket.removeListener("connect", onConnect);
          revitClient.socket.removeListener("error", onError);
          resolve();
        };

        const onError = (error: any) => {
          revitClient.socket.removeListener("connect", onConnect);
          revitClient.socket.removeListener("error", onError);
          reject(new Error("Failed to connect to Revit plugin"));
        };

        revitClient.socket.on("connect", onConnect);
        revitClient.socket.on("error", onError);

        revitClient.connect();

        setTimeout(() => {
          revitClient.socket.removeListener("connect", onConnect);
          revitClient.socket.removeListener("error", onError);
          reject(new Error("Connection to Revit timed out"));
        }, 5000);
      });
    }

    return await operation(revitClient);
  } finally {
    revitClient.disconnect();
    releaseMutex!();
  }
}
