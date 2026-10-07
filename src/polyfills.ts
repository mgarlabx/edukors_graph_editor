/**
 * What Safari 15.4 added and the editor (or a library in its bundle) calls, for the
 * WebKit of macOS 12.0–12.2. Each is installed only where it is missing. The syntax
 * side is handled by the build target (vite.config.ts).
 */

const define = (target: object, name: string, value: unknown) => {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
};

function clone<T>(value: T, seen = new Map<unknown, unknown>()): T {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof RegExp) return new RegExp(value.source, value.flags) as T;
  if (value instanceof Map) {
    const out = new Map();
    seen.set(value, out);
    value.forEach((v, k) => out.set(clone(k, seen), clone(v, seen)));
    return out as T;
  }
  if (value instanceof Set) {
    const out = new Set();
    seen.set(value, out);
    value.forEach((v) => out.add(clone(v, seen)));
    return out as T;
  }
  const out = (Array.isArray(value) ? [] : {}) as Record<string, unknown>;
  seen.set(value, out);
  for (const key of Object.keys(value)) out[key] = clone((value as Record<string, unknown>)[key], seen);
  return out as T;
}

define(globalThis, "structuredClone", (value: unknown) => clone(value));

if (typeof crypto !== "undefined") {
  define(crypto, "randomUUID", () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  });
}

define(Object, "hasOwn", (o: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(o, key));

function at(this: ArrayLike<unknown>, index: number) {
  const i = Math.trunc(index) || 0;
  return this[i < 0 ? this.length + i : i];
}
define(Array.prototype, "at", at);
define(String.prototype, "at", at);

define(Array.prototype, "findLast", function (this: unknown[], test: (v: unknown, i: number, a: unknown[]) => unknown, self?: unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return this[i];
  return undefined;
});
define(Array.prototype, "findLastIndex", function (this: unknown[], test: (v: unknown, i: number, a: unknown[]) => unknown, self?: unknown) {
  for (let i = this.length - 1; i >= 0; i--) if (test.call(self, this[i], i, this)) return i;
  return -1;
});
