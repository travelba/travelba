import "server-only";

type SharpFn = typeof import("sharp")["default"];

let loaded: Promise<SharpFn> | null = null;

async function loadSharp(): Promise<SharpFn> {
  if (!loaded) {
    loaded = import("sharp").then((mod) => mod.default);
  }
  try {
    return await loaded;
  } catch (err) {
    loaded = null;
    throw err;
  }
}

export async function getSharp(): Promise<SharpFn> {
  return loadSharp();
}

export async function trySharp(): Promise<SharpFn | null> {
  try {
    return await loadSharp();
  } catch (err) {
    console.error("[sharp] module linux indisponible", err);
    return null;
  }
}
