import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";
import { asError, asText } from "../rcd/schemas.js";

export function registerRevitUiStateTool(server: McpServer) {
  server.tool(
    "revit_ui_state",
    [
      "Look at Revit without touching it: status bar text (what Revit is waiting for), whether it is idle, foreground window, open dialogs (title/buttons), element changes since a marker (added/modified/deleted ids + transaction names), dialog events, and the driver lock/mapping state.",
      "Call after revit_cmd_post / revit_ui_input to verify what was created, and whenever something looks wrong. Works even while Revit is inside a command or a modal dialog.",
      "includeLiveMapping=true additionally asks Revit (API) for the live view mapping and reports liveApiAvailable=false if Revit is too busy to answer.",
    ].join(" "),
    {
      sinceMarker: z.number().int().optional().describe("Marker from revit_cmd_post (default: last marker)."),
      maxIds: z.number().int().optional().describe("Cap on ids per list (default 200)."),
      includeLiveMapping: z.boolean().optional(),
      liveTimeoutMs: z.number().int().optional().describe("How long to wait for the live API probe (default 700)."),
    },
    async (args) => {
      try {
        const response = await withRevitConnection((c) => c.sendCommand("rcd_ui_state", args));
        return asText(response);
      } catch (error) {
        return asError(error);
      }
    }
  );
}
