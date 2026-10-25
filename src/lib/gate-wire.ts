/**
 * Arguments of a gate call (src/lib/gate-call.ts → src/app/api/gate/route.ts)
 * travel as JSON, which has no `undefined`: inside an array it silently
 * becomes `null`. An optional argument left out (no note, no photo) would then
 * reach the server as null and fail checks meant for "a value was given" — e.g.
 * every exit without a note was refused. So a missing argument is sent as this
 * marker and turned back into `undefined` on the server; a real null stays null.
 */
const MARKER_KEY = "$gateUndefined";

export function encodeGateArgs(args: readonly unknown[]): unknown[] {
  return args.map((a) => (a === undefined ? { [MARKER_KEY]: 1 } : a));
}

export function decodeGateArgs(args: readonly unknown[]): unknown[] {
  return args.map((a) =>
    a !== null && typeof a === "object" && !Array.isArray(a) && Object.keys(a).length === 1 && (a as Record<string, unknown>)[MARKER_KEY] === 1
      ? undefined
      : a
  );
}
