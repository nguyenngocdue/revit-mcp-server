import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PYTHON_TIMEOUT_MS = 15000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB

function runPythonCode(
  code: string,
  context: unknown
): Promise<unknown> {
  return new Promise((resolve) => {
    // Write code to temp file, inject context variable
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `revit_mcp_${Date.now()}.py`);

    const contextJson = JSON.stringify(context ?? {});
    const wrappedCode = [
      "import json, sys",
      `context = json.loads(${JSON.stringify(contextJson)})`,
      "",
      code,
      "",
      "# Ensure result is printed as JSON",
      "if 'result' not in dir():",
      "    raise NameError(\"Script must define variable 'result'\")",
      "print(json.dumps(result))",
    ].join("\n");

    try {
      fs.writeFileSync(tmpFile, wrappedCode, "utf8");
    } catch (writeErr) {
      resolve({
        success: false,
        stage: "python_execution",
        errorType: "IOError",
        message: `Failed to write temp file: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
        traceback: "",
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let finished = false;

    const proc = spawn("python", [tmpFile], { timeout: PYTHON_TIMEOUT_MS });

    proc.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length <= MAX_BUFFER_BYTES) {
        stdout += chunk.toString("utf8");
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      if (!finished) {
        proc.kill();
        cleanup();
        resolve({
          success: false,
          stage: "python_execution",
          errorType: "TimeoutError",
          message: `Python script exceeded ${PYTHON_TIMEOUT_MS}ms timeout`,
          traceback: "",
        });
      }
    }, PYTHON_TIMEOUT_MS);

    proc.on("close", (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();

      if (code !== 0) {
        // Parse Python traceback for structured error
        const tracebackMatch = stderr.match(/(\w+Error[^\n]*)/);
        const errorType = tracebackMatch ? tracebackMatch[1].split(":")[0].trim() : "PythonError";
        const message = tracebackMatch ? tracebackMatch[1].replace(errorType + ": ", "").trim() : stderr.trim();

        resolve({
          success: false,
          stage: "python_execution",
          errorType,
          message,
          traceback: stderr.trim(),
        });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({ success: true, result: parsed });
      } catch {
        resolve({
          success: false,
          stage: "python_execution",
          errorType: "JSONDecodeError",
          message: "Script output is not valid JSON",
          traceback: stdout.trim(),
        });
      }
    });

    proc.on("error", (err: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      resolve({
        success: false,
        stage: "python_execution",
        errorType: "SpawnError",
        message: err.message,
        traceback: "",
      });
    });

    function cleanup() {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  });
}

export function registerRunPythonScriptTool(server: McpServer) {
  server.tool(
    "run_python_script",
    "Run a Python script to compute logic and generate a list of operations. The script receives a `context` variable and must define a `result` variable. Python does NOT call the Revit API — pure computation only.",
    {
      code: z
        .string()
        .describe(
          "Python code to execute. Must define a `result` variable. Has access to `context` variable (dict). Use standard library only."
        ),
      context: z
        .record(z.unknown())
        .optional()
        .describe("Context data passed to the script as the `context` variable"),
    },
    async (args, _extra) => {
      const result = await runPythonCode(args.code, args.context ?? {});

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
