import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// HuggingFace Hub repo that hosts grout_best.pt
const HF_REPO_ID = process.env.GROUT_TUBE_HF_REPO ?? "nissan3008/grout-tube";

// Python executable — override if needed (e.g. /usr/bin/python3)
const PYTHON_BIN = process.env.GROUT_TUBE_PYTHON ?? "python3";

const TIMEOUT_MS = 120_000; // 2 minutes — detection on large PDFs can be slow

/**
 * Inline Python script that:
 * 1. Downloads model from HF Hub (cached after first run at ~/.cache/huggingface)
 * 2. Runs grout tube detection on the given PDF
 * 3. Prints JSON result after a "---JSON---" marker
 *
 * Self-contained — no dependency on local grout_yolo project structure.
 */
function buildInlineScript(pdfPath: string, conf: number, hfRepo: string): string {
  // Escape paths for Python string literals
  const safePdf = pdfPath.replace(/\\/g, "/");
  return `
import json, sys
from pathlib import Path
from huggingface_hub import hf_hub_download

# ── 1. Download / use cached model weights ──────────────────────────────────
weights = hf_hub_download(repo_id=${JSON.stringify(hfRepo)}, filename="grout_best.pt")

# ── 2. Bootstrap grout package (if installed via pip or present on sys.path) ─
try:
    from grout.detector import GroutDetector, draw_objects, annotate_pdf
    from grout.pdf_utils import render_pdf_page
    from grout.text_parser import parse_grout_tube_notes_with_pos
    from grout.validator import validate
except ImportError:
    # Fallback: look for grout package next to this script (dev setup)
    import importlib, pathlib
    for candidate in [
        pathlib.Path.home() / "scientist/tube/grout_yolo/src",
        pathlib.Path("/home/nguyenngocdue/scientist/tube/grout_yolo/src"),
    ]:
        if candidate.exists():
            sys.path.insert(0, str(candidate))
            break
    from grout.detector import GroutDetector, draw_objects, annotate_pdf
    from grout.pdf_utils import render_pdf_page
    from grout.text_parser import parse_grout_tube_notes_with_pos
    from grout.validator import validate

# ── 3. Run detection ─────────────────────────────────────────────────────────
pdf = Path(${JSON.stringify(safePdf)})
img = render_pdf_page(pdf, dpi=300, page_index=0)
det = GroutDetector(weights)
objs = det.predict(img, conf=${conf}, iou=0.5, imgsz=1024)
notes = parse_grout_tube_notes_with_pos(pdf, dpi=300, page_index=0)
report = validate(notes, objs)

result = {"pdf": str(pdf), "objects": objs, "notes": notes, "report": report}
print("---JSON---")
print(json.dumps(result))
`;
}

/** Convert Windows path → WSL path if needed (e.g. C:\foo → /mnt/c/foo) */
function toWslPath(p: string): string {
  const m = p.match(/^([A-Za-z]):[\\\/](.*)/);
  if (!m) return p; // already Linux path
  return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
}

function runGroutCheck(pdfPath: string, conf: number): Promise<unknown> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let finished = false;

    const script = buildInlineScript(pdfPath, conf, HF_REPO_ID);
    const proc = spawn(PYTHON_BIN, ["-c", script]);

    const timer = setTimeout(() => {
      if (!finished) {
        proc.kill();
        finished = true;
        resolve({ success: false, error: "Timeout after 2 minutes", pdf: pdfPath });
      }
    }, TIMEOUT_MS);

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });

    proc.on("close", (code: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      if (code !== 0) {
        resolve({
          success: false,
          error: stderr.trim() || `Process exited with code ${code}`,
          pdf: pdfPath,
        });
        return;
      }

      // Extract JSON block after "---JSON---" marker
      const marker = stdout.indexOf("---JSON---");
      if (marker === -1) {
        resolve({ success: false, error: "No JSON output from script", stdout: stdout.trim() });
        return;
      }

      try {
        const jsonStr = stdout.slice(marker + "---JSON---".length).trim();
        const data = JSON.parse(jsonStr);
        resolve({ success: true, ...data });
      } catch {
        resolve({ success: false, error: "Failed to parse JSON output", raw: stdout.trim() });
      }
    });

    proc.on("error", (err: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ success: false, error: `Failed to spawn process: ${err.message}` });
    });
  });
}

export function registerCheckGroutTubeTool(server: McpServer) {
  server.tool(
    "check_grout_tube",
    `Detect Grout Tube symbols (NF/FF) on a 2D engineering drawing PDF exported from Revit.
Uses a trained YOLOv8 model to find each grout tube, classify it as NF (Near Face, filled circle) or FF (Far Face, hollow circle), then validates the count and face against text notes on the drawing.

Accepts EITHER:
- pdf_path: local file path (Windows or Linux), e.g. "C:\\Projects\\NHAT1.pdf"
- pdf_base64: base64-encoded PDF content (when user attaches/uploads the file directly)

Returns detected objects with bounding boxes, parsed text notes, and a PASS/FAIL validation report.`,
    {
      pdf_path: z
        .string()
        .optional()
        .describe("Absolute path to the PDF file. Windows paths like C:\\foo\\bar.pdf are accepted and auto-converted."),
      pdf_base64: z
        .string()
        .optional()
        .describe("Base64-encoded PDF file content. Use this when the user uploads/attaches the PDF directly in chat."),
      pdf_filename: z
        .string()
        .optional()
        .describe("Original filename of the PDF (used when pdf_base64 is provided, e.g. 'NHAT1.pdf')."),
      conf: z
        .number()
        .min(0.1)
        .max(1.0)
        .optional()
        .describe("Detection confidence threshold (default 0.25). Lower = more detections but more false positives."),
    },
    async (args: { pdf_path?: string; pdf_base64?: string; pdf_filename?: string; conf?: number }) => {
      const conf = args.conf ?? 0.25;
      let resolvedPath: string;
      let tempFile: string | null = null;

      if (args.pdf_base64) {
        // Decode base64 → write to temp file
        const filename = args.pdf_filename ?? `grout_check_${Date.now()}.pdf`;
        tempFile = path.join(os.tmpdir(), filename);
        fs.writeFileSync(tempFile, Buffer.from(args.pdf_base64, "base64"));
        resolvedPath = toWslPath(tempFile);
      } else if (args.pdf_path) {
        resolvedPath = toWslPath(args.pdf_path);
      } else {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ success: false, error: "Provide either pdf_path or pdf_base64." }),
          }],
        };
      }

      try {
        const result = await runGroutCheck(resolvedPath, conf);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } finally {
        // Clean up temp file if we created one
        if (tempFile) {
          try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
        }
      }
    }
  );
}
