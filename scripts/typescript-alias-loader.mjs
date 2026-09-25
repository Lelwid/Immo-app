import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  let basePath;

  if (specifier.startsWith("@/")) {
    basePath = resolvePath(process.cwd(), "src", specifier.slice(2));
  } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    basePath = resolvePath(fileURLToPath(new URL(".", context.parentURL)), specifier);
  } else {
    return nextResolve(specifier, context);
  }

  const path = [basePath, `${basePath}.ts`, `${basePath}.tsx`, resolvePath(basePath, "index.ts")].find((candidate) => existsSync(candidate));

  if (!path) {
    return nextResolve(specifier, context);
  }

  return {
    shortCircuit: true,
    url: pathToFileURL(path).href,
  };
}
