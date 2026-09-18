import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseRoot = resolve(repositoryRoot, "release", "domainesia");
const manifestPath = resolve(releaseRoot, "package.json");
const lockPath = resolve(releaseRoot, "package-lock.json");
const originalManifest = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(originalManifest);

if (!manifest.dependencies || manifest.devDependencies) {
  throw new Error(
    "Manifest rilis belum siap. Jalankan pnpm domainesia:package terlebih dahulu.",
  );
}

await rm(lockPath, { force: true });

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli || !pnpmCli.toLowerCase().includes("pnpm")) {
  throw new Error("Jalankan skrip melalui pnpm domainesia:lock.");
}
const argumentsList = [
  "--package=npm@10.9.4",
  "dlx",
  "npm",
  "install",
  "--package-lock-only",
  "--ignore-scripts",
  "--omit=dev",
  "--no-audit",
  "--no-fund",
];

const exitCode = await new Promise((resolveExit, reject) => {
  const child = spawn(process.execPath, [pnpmCli, ...argumentsList], {
    cwd: releaseRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) {
      reject(new Error(`Pembuatan lock dihentikan oleh sinyal ${signal}.`));
      return;
    }
    resolveExit(code ?? 1);
  });
});

if (exitCode !== 0) {
  throw new Error(`NPM gagal membuat package-lock.json (exit ${exitCode}).`);
}

const currentManifest = await readFile(manifestPath, "utf8");
if (currentManifest !== originalManifest) {
  await writeFile(manifestPath, originalManifest, "utf8");
  await rm(lockPath, { force: true });
  throw new Error(
    "NPM mengubah package.json rilis. Manifest dipulihkan dan lock ditolak.",
  );
}

const lock = JSON.parse(await readFile(lockPath, "utf8"));
const rootLock = lock.packages?.[""];
const manifestNames = Object.keys(manifest.dependencies).sort();
const lockNames = Object.keys(rootLock?.dependencies || {}).sort();
const leakedWorkspace =
  Object.keys(lock.packages || {}).some((name) => name.startsWith("..")) ||
  JSON.stringify(lock).includes('"file:');

if (
  lock.lockfileVersion !== 3 ||
  leakedWorkspace ||
  JSON.stringify(manifestNames) !== JSON.stringify(lockNames)
) {
  await rm(lockPath, { force: true });
  throw new Error(
    "package-lock.json tidak mandiri atau tidak cocok dengan dependensi produksi.",
  );
}

console.log(`Lock produksi siap di: ${lockPath}`);
