import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);
const Module = nodeRequire("module") as { _load: (...args: unknown[]) => unknown };
const load = Module._load;
Module._load = function (request: unknown, parent: unknown, isMain: unknown) {
  if (request === "next/navigation") {
    return { useRouter: () => ({ refresh() {}, push() {} }) };
  }
  return load.call(this, request, parent, isMain);
};
