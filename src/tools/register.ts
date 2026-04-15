import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Cache loaded register functions so dynamic import only runs once
type RegisterFn = (server: McpServer) => void;
let cachedRegisterFns: RegisterFn[] | null = null;

async function loadRegisterFns(): Promise<RegisterFn[]> {
  if (cachedRegisterFns) return cachedRegisterFns;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const files = fs.readdirSync(__dirname).filter(
    (file) =>
      (file.endsWith(".ts") || file.endsWith(".js")) &&
      !file.endsWith(".d.ts") &&
      !file.endsWith(".d.ts.map") &&
      file !== "index.ts" &&
      file !== "index.js" &&
      file !== "register.ts" &&
      file !== "register.js"
  );

  const fns: RegisterFn[] = [];
  for (const file of files) {
    try {
      const importPath = `./${file.replace(/\.(ts|js)$/, ".js")}`;
      const module = await import(importPath);
      const fnName = Object.keys(module).find(
        (key) => key.startsWith("register") && typeof module[key] === "function"
      );
      if (fnName) fns.push(module[fnName]);
    } catch (error) {
      console.error(`Error loading tool ${file}:`, error);
    }
  }

  cachedRegisterFns = fns;
  return fns;
}

export async function registerTools(server: McpServer) {
  const fns = await loadRegisterFns();
  for (const fn of fns) {
    fn(server);
  }
}
