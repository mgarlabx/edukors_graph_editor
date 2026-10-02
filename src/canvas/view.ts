import type { Position } from "../store/layout";

/** Where the canvas on screen is looking, for nodes pasted from another course; null while no canvas is shown. */
export const canvasView: { center: (() => Position) | null } = { center: null };
