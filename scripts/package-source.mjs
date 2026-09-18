import { cp, lstat, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = resolve(
  repositoryRoot,
  "release",
  "portal-desa-cipeundeuy-source",
);

const files = [
  ".env.example",
  ".env.domainesia.example",
  ".gitignore",
  "app_wrapper.cjs",
  "compose.dev.yaml",
  "DOMAINESIA.md",
  "drizzle.config.ts",
  "eslint.config.mjs",
  "GITHUB.md",
  "next.config.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "postcss.config.mjs",
  "README.md",
  "server.js",
  "tsconfig.json",
  "VERSI-88.md",
];

const directories = ["app", "db", "drizzle", "public", "scripts", "tests"];

function isSafeRelativePath(path) {
  return !path.startsWith("..") && !path.includes("\\..\\") && !path.includes("/../");
}

async function assertNoSymlink(path) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) {
    throw new Error(
      `Paket sumber dihentikan: ${path} adalah symbolic link atau junction.`,
    );
  }
}

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });

for (const relativePath of [...files, ...directories]) {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Path paket tidak aman: ${relativePath}`);
  }

  const source = resolve(repositoryRoot, relativePath);
  const destination = resolve(releaseRoot, relativePath);
  await assertNoSymlink(source);
  await cp(source, destination, { recursive: true, dereference: false });
}

console.log(`Paket sumber siap di: ${releaseRoot}`);
console.log(
  "Folder ini siap untuk VS Code dan GitHub; .env, node_modules, .next, serta release tidak disertakan.",
);
