import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { withRevitConnection } from "../utils/ConnectionManager.js";
import { asError, asText } from "../rcd/schemas.js";

export function registerRevitDialogPolicyTool(server: McpServer) {
  server.tool(
    "revit_dialog_policy",
    "Set, clear or list session rules that auto-answer Revit dialogs while the driver works (e.g. a warning 'elements are not joined' → OK). Rules match TaskDialog id and/or message regex and expire after ttlMs. Never auto-confirm destructive dialogs (delete, overwrite, sync, detach) unless the user asked for it. 'list' also returns recent dialog events observed by the plugin.",
    {
      action: z.enum(["set", "clear", "list"]),
      rules: z
        .array(
          z.object({
            dialogId: z.string().optional().describe("TaskDialog id, e.g. 'TaskDialog_Unjoined_Elements' (see dialogEvents from revit_ui_state)."),
            messageRegex: z.string().optional().describe("Regex tested against the dialog message."),
            titleRegex: z.string().optional(),
            overrideResult: z.union([z.number().int(), z.string(), z.object({ commandLink: z.number().int() })]).describe("IDOK | IDCANCEL | IDYES | IDNO | integer result code | { commandLink: n }."),
            once: z.boolean().optional().describe("Apply only to the next matching dialog."),
          })
        )
        .optional(),
      ttlMs: z.number().int().optional().describe("Rule lifetime (default 60000)."),
    },
    async (args) => {
      try {
        const response = await withRevitConnection((c) => c.sendCommand("rcd_dialog_policy", args));
        return asText(response);
      } catch (error) {
        return asError(error);
      }
    }
  );
}
