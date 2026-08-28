import { z } from "zod";

/** Model-space point in millimetres: [x, y, z]. */
export const pointMm = z
  .tuple([z.number(), z.number(), z.number()])
  .describe("Model point in millimetres [x, y, z] (project internal coordinates).");

export const elementId = z.number().int().describe("Revit ElementId (integer).");

export const prepareSchema = z
  .object({
    activeViewId: elementId
      .optional()
      .describe("Switch to this view before posting. Interactive drawing needs a plan/section/elevation/drafting view. Walls/beams take their level from the plan view they are drawn in."),
    selectElementIds: z.array(elementId).optional().describe("Select these elements before posting (for selection-based commands like Delete, Pin, Copy, Move, Mirror)."),
    clearSelection: z.boolean().optional().describe("Clear the selection before posting."),
    fitPoints: z.array(pointMm).optional().describe("Zoom the view so all these points are visible before capturing the screen mapping. Pass every point you intend to click."),
    fitPaddingMm: z.number().optional().describe("Padding around fitPoints in mm (default 1500)."),
    maxMmPerPixel: z.number().optional().describe("Precision target; a warning is returned if the fit needs more mm per pixel than this (default 5)."),
    defaultType: z
      .object({
        typeId: elementId.describe("ElementType id to make the default for the command's Type Selector."),
        group: z.string().optional().describe("ElementTypeGroup for system families: WallType, FloorType, RoofType, CeilingType, TextNoteType, DimensionType, ..."),
        categoryId: z.number().int().optional().describe("Category id for loadable families (e.g. Doors -2000023, Windows -2000014, Structural Framing -2001320, Structural Columns -2001330, Generic Models -2000151)."),
      })
      .optional()
      .describe("Set the default type Revit will use when the command starts (system families via group, loadable families via categoryId)."),
  })
  .optional();

export const expectSchema = z
  .enum(["instant", "selection", "points", "sketch", "dialog", "unknown"])
  .optional()
  .describe("How the command behaves after posting. Omit to use the catalog hint. 'points'/'sketch' lock the driver and capture the view mapping for revit_ui_input.");

export const inputStepSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("waitStatus"),
    contains: z.string().optional().describe("Wait until the status bar contains this text (case-insensitive), e.g. 'start point'."),
    regex: z.string().optional().describe("Alternative: regex the status bar must match."),
    timeoutMs: z.number().int().optional().describe("Default 5000, max 15000."),
  }),
  z.object({
    type: z.literal("click"),
    point: pointMm.optional().describe("Model point (mm) to click — converted through the captured view mapping."),
    screen: z.tuple([z.number(), z.number()]).optional().describe("Alternative: absolute screen pixel [px, py]."),
    button: z.enum(["left", "right", "middle"]).optional(),
    holdShift: z.boolean().optional().describe("Hold Shift during the click (ortho constraint)."),
    snapOverride: z.enum(["SO", "SE", "SM", "SI", "SC", "SP", "SN", "SQ", "SW", "ST", "SX"]).optional().describe("Type a snap override right before the click: SO = snaps off, SE endpoint, SM midpoint, SI intersection, SC center, SP perpendicular, SN nearest, SQ quadrant, SW work plane grid, ST tangent, SX points."),
    expectStatus: z.string().optional().describe("Text the status bar should contain after this step (checked when stopOnStatusMismatch)."),
  }),
  z.object({
    type: z.literal("dblclick"),
    point: pointMm.optional(),
    screen: z.tuple([z.number(), z.number()]).optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
  }),
  z.object({
    type: z.literal("move"),
    point: pointMm.optional().describe("Move the cursor to this model point (mm) without clicking — used to set a direction before typing a length."),
    screen: z.tuple([z.number(), z.number()]).optional(),
    holdShift: z.boolean().optional().describe("Hold Shift while moving (ortho)."),
  }),
  z.object({
    type: z.literal("drag"),
    from: pointMm,
    to: pointMm,
    button: z.enum(["left", "right", "middle"]).optional(),
    holdShift: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("type"),
    text: z.string().describe("Text to type as real key presses (numbers for listening dimensions, shortcuts, etc.)."),
    enter: z.boolean().optional().describe("Press Enter after the text."),
  }),
  z.object({
    type: z.literal("key"),
    key: z.string().describe("Escape, Enter, Tab, Space, Delete, Backspace, Up/Down/Left/Right, Home, End, F1..F12, or a single letter/digit."),
    times: z.number().int().optional().describe("Repeat count (Escape ×2 exits a command)."),
    modifiers: z.array(z.enum(["Shift", "Ctrl", "Alt"])).optional(),
  }),
  z.object({
    type: z.literal("wait"),
    ms: z.number().int().describe("Sleep (max 5000 ms)."),
  }),
  z.object({
    type: z.literal("waitChanges"),
    minAdded: z.number().int().optional().describe("Wait until at least this many elements were added since the marker (default 1)."),
    timeoutMs: z.number().int().optional(),
  }),
]);

export type InputStep = z.infer<typeof inputStepSchema>;

export function asText(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

export function asError(error: unknown) {
  return asText({ success: false, message: error instanceof Error ? error.message : String(error) });
}
