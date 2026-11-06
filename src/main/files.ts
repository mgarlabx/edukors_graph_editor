import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

/** Writes a file whole: a temporary file in the same folder, synced, then renamed over the target. */
export async function atomicWrite(file: string, data: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await fs.open(temp, "w");
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temp, file);
  } catch (e) {
    await fs.rm(temp, { force: true });
    throw e;
  }
}

async function identity(file: string) {
  const resolved = await fs.realpath(file).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return path.join(await fs.realpath(path.dirname(file)), path.basename(file));
  });
  const stat = await fs.stat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  return { resolved, stat };
}

/** Exporting is not saving: it never replaces the course's .egrx, the file it was imported from, or any .egrx. */
export async function assertExportTarget(target: string, protectedFiles: string[]) {
  if (target.toLowerCase().endsWith(".egrx")) throw Error("Choose another export name: a course file (.egrx) is never replaced by an export.");
  const output = await identity(target);
  for (const file of protectedFiles) {
    if (!file) continue;
    const kept = await identity(file).catch(() => null);
    if (!kept) continue;
    if (output.resolved === kept.resolved || (output.stat && kept.stat && output.stat.dev === kept.stat.dev && output.stat.ino === kept.stat.ino))
      throw Error("Choose another export name: the course and the file it came from stay unchanged.");
  }
}
