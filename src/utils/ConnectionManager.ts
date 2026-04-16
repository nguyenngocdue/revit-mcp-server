import { RevitClientConnection } from "./SocketClient.js";
import * as net from "net";

let connectionMutex: Promise<void> = Promise.resolve();

const PORT_START = 8080;
const PORT_END = 8099;

// If REVIT_HOST / REVIT_PORT are set, skip port scan and connect directly.
// Use this when the Revit plugin is exposed via a TCP tunnel (e.g. ngrok tcp 8080).
// Example .env:
//   REVIT_HOST=0.tcp.ngrok.io
//   REVIT_PORT=12345
const REVIT_HOST_OVERRIDE = process.env.REVIT_HOST;
const REVIT_PORT_OVERRIDE = process.env.REVIT_PORT
  ? parseInt(process.env.REVIT_PORT, 10)
  : undefined;

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

  const host = REVIT_HOST_OVERRIDE ?? "localhost";
  const port = REVIT_PORT_OVERRIDE ?? (await findRevitPort());
  const revitClient = new RevitClientConnection(host, port);

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
