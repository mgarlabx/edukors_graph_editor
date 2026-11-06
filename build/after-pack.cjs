// Before signing: the app uses no camera, microphone or Bluetooth, but Electron's Info.plist declares them (macOS would
// list them as permissions the app may ask for); and Dropbox's extended attributes, copied with the files, break
// code signing, so they are cleared.
const { execFileSync } = require("node:child_process");
const path = require("node:path");
exports.default = async (ctx) => {
  if (ctx.electronPlatformName !== "darwin") return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  const plist = path.join(app, "Contents", "Info.plist");
  for (const key of ["NSCameraUsageDescription", "NSMicrophoneUsageDescription", "NSAudioCaptureUsageDescription", "NSBluetoothPeripheralUsageDescription", "NSBluetoothAlwaysUsageDescription"])
    try { execFileSync("plutil", ["-remove", key, plist], { stdio: "ignore" }); } catch {}
  execFileSync("xattr", ["-cr", app]);
};
