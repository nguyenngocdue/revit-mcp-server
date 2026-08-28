import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";
import { asError, asText } from "../rcd/schemas.js";

export function registerRevitUiCancelTool(server: McpServer) {
  server.tool(
    "revit_ui_cancel",
    "Recover Revit: abort any running input batch, press Escape (default 3×) to leave the current command, close stray dialogs (Cancel/No/Close by default), and release the driver lock. Call this whenever revit_cmd_post or revit_ui_input returns an error, a dialog is open, or before starting a new command while Revit is not idle.",
    {
      escapes: z.number().int().optional().describe("Number of Escape presses (default 3)."),
      closeDialogs: z.enum(["cancel", "ok", "none"]).optional().describe("How to close open dialogs (default cancel). 'ok' confirms — only use when you know the dialog is harmless."),
      releaseLock: z.boolean().optional(),
      lockToken: z.string().optional(),
      force: z.boolean().optional().describe("Release a lock held by another token."),
    },
    async (args) => {
      try {
        const response = await withRevitConnection((c) => c.sendCommand("rcd_ui_cancel", args));
        return asText(response);
      } catch (error) {
        return asError(error);
      }
    }
  );
}
