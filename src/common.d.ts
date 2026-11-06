// Edukors Common (plain JavaScript): page scripts that set globals, and the Electron host.
declare module "edukors-common-ux/src/*";
declare module "edukors-common-ux/desktop/host.mjs" {
  export function startDesktopApp(options: Record<string, unknown>): void;
}
