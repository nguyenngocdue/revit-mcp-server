import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";
import { asError, asText, inputStepSchema } from "../rcd/schemas.js";

export function registerRevitUiInputTool(server: McpServer) {
  server.tool(
    "revit_ui_input",
    [
      "Operate Revit like a human after revit_cmd_post started an interactive command: click model points (mm, converted through the captured view mapping), move the cursor, type numbers (listening dimensions), press keys, wait for status-bar prompts.",
      "Rules: ALWAYS begin with { type: 'waitStatus', contains: 'start point' | 'place' | 'reference' | 'Click' } and ALWAYS end with { type: 'key', key: 'Escape', times: 2 }. Read statusAfter of each step to learn what Revit waits for next. Click near grid intersections / endpoints and let snapping give exact coordinates (snapOverride 'SI' forces intersection, 'SO' disables snapping). For exact lengths: click start, move toward the direction with holdShift, then type '6000' with enter.",
      "Many commands stay active after one element (Wall chain, Beam, Door) so one batch can place several elements. The batch stops on the first failure, on an unexpected dialog (DIALOG_OPEN) or if Revit loses focus. dryRun=true only computes pixels.",
      "Returns per-step results, statusFinal, idle, dialog, and changes (element ids added/modified/deleted since the marker).",
    ].join(" "),
    {
      steps: z.array(inputStepSchema).min(1).max(200),
      lockToken: z.string().optional(),
      sinceMarker: z.number().int().optional().describe("Marker from revit_cmd_post (defaults to the last one)."),
      stopOnDialog: z.boolean().optional().describe("Stop when a new dialog appears (default true)."),
      stopOnStatusMismatch: z.boolean().optional().describe("Stop when a step's expectStatus is not in the status bar (default false)."),
      interStepDelayMs: z.number().int().optional().describe("Delay between steps (default 60)."),
      dryRun: z.boolean().optional().describe("Compute screen pixels only, send nothing."),
    },
    async (args) => {
      try {
        const response = await withRevitConnection((c) => c.sendCommand("rcd_ui_input", args));
        return asText(response);
      } catch (error) {
        return asError(error);
      }
    }
  );
}
