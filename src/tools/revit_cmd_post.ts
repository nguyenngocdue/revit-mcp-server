import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";
import { asError, asText, expectSchema, prepareSchema } from "../rcd/schemas.js";

export function registerRevitCmdPostTool(server: McpServer) {
  server.tool(
    "revit_cmd_post",
    [
      "Start a built-in Revit command exactly as if the user typed its shortcut (UIApplication.PostCommand). Optionally prepare the context first: switch view, set selection, zoom to the points you will click, and set the default type.",
      "Flow: (1) revit_cmd_search → (2) revit_cmd_post → (3) for 'points'/'sketch' commands call revit_ui_input (start with waitStatus, end with key Escape ×2) → (4) revit_ui_state with the returned marker to see created elements → (5) fix parameters with modify_element → on any problem revit_ui_cancel.",
      "Returns marker (ChangeTracker sequence), mapping (view↔screen, mm/px), statusBefore and next-step guidance. 'selection' commands (Delete, Pin, Hide…) run immediately on prepare.selectElementIds. 'dialog' commands open a dialog — inspect with revit_ui_state.",
      "Levels come from the view: draw walls in the Level 1 plan to get Level 1 walls; beams in the Level 2 plan get Reference Level = Level 2.",
    ].join(" "),
    {
      command: z.string().describe("Command name from revit_cmd_search (e.g. 'ArchitecturalWall'), a command id ('ID_OBJECTS_WALL'), a unique shortcut ('WA'), or a raw add-in id ('CustomCtrl_%…')."),
      expect: expectSchema,
      prepare: prepareSchema,
      lockToken: z.string().optional().describe("Session token for the driver lock (optional; default shared token)."),
      lockTtlMs: z.number().int().optional().describe("Lock TTL in ms (default 120000)."),
    },
    async (args) => {
      try {
        const response = await withRevitConnection((c) => c.sendCommand("rcd_post_command", args));
        return asText(response);
      } catch (error) {
        return asError(error);
      }
    }
  );
}
