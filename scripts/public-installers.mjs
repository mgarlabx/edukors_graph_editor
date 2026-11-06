// Add stable public download names without renaming files referenced by the updater.
import { copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const [directory, version] = process.argv.slice(2);
if (!directory || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  throw new Error('Usage: node scripts/public-installers.mjs <directory> <version>');
}
const prefix = 'Edukors-Graph-Editor';
const copies = [
  [`${prefix}-${version}-mac-universal.dmg`, `${prefix}-mac.dmg`],
  [`${prefix}-${version}-setup.exe`, `${prefix}-windows.exe`],
];
for (const [extension, arch] of [['AppImage', 'x86_64'], ['deb', 'amd64']]) {
  copies.push([`${prefix}-${version}-linux-${arch}.${extension}`, `${prefix}-linux.${extension}`]);
}
const names = new Set(await readdir(directory));
// Validate everything before writing any aliases; never pick an older cached installer.
for (const [source, destination] of copies) {
  if (!names.has(source)) throw new Error(`Missing installer: ${source}`);
  if (names.has(destination)) throw new Error(`Public name already exists: ${destination}`);
}
for (const [source, destination] of copies) {
  await copyFile(path.join(directory, source), path.join(directory, destination));
}
