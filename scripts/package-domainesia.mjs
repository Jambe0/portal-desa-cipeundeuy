import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseParent = resolve(repositoryRoot, "release");
const releaseRoot = resolve(releaseParent, "domainesia");
const releaseRelative = relative(releaseParent, releaseRoot);

function normalizedRelative(root, target) {
  return relative(root, target).split(sep).join("/");
}

function includeNextArtifact(target) {
  const path = normalizedRelative(resolve(repositoryRoot, ".next"), target);
  return !(
    path === "dev" ||
    path.startsWith("dev/") ||
    path === "cache" ||
    path.startsWith("cache/") ||
    path === "standalone" ||
    path.startsWith("standalone/") ||
    path.endsWith(".nft.json")
  );
}

async function assertPortableTree(root, filter = () => true) {
  async function visit(target) {
    if (!filter(target)) return;

    const metadata = await lstat(target);
    const displayPath = normalizedRelative(repositoryRoot, target);

    if (metadata.isSymbolicLink()) {
      throw new Error(
        `Artefak tidak portabel: ${displayPath} adalah symbolic link/junction. ` +
          "Gunakan build Webpack melalui pnpm domainesia:package.",
      );
    }

    if (metadata.isFile()) {
      if (extname(target).toLowerCase() === ".node") {
        throw new Error(
          `Artefak native ${displayPath} tidak boleh dibawa dari komputer lokal. ` +
            "Dependensi Linux harus dipasang oleh cPanel.",
        );
      }
      return;
    }

    if (!metadata.isDirectory()) return;
    for (const entry of await readdir(target)) {
      await visit(resolve(target, entry));
    }
  }

  await visit(root);
}

if (
  !releaseRelative ||
  releaseRelative.startsWith("..") ||
  releaseRelative.includes(`..${sep}`)
) {
  throw new Error("Target paket deployment berada di luar folder release.");
}

await access(resolve(repositoryRoot, ".next", "BUILD_ID"));

try {
  await access(resolve(repositoryRoot, ".next", "node_modules"));
  throw new Error(
    "Build .next masih membawa node_modules hasil Turbopack. " +
      "Jalankan pnpm domainesia:package agar Next.js membangun ulang dengan Webpack.",
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await assertPortableTree(resolve(repositoryRoot, ".next"), includeNextArtifact);
await rm(releaseRoot, { recursive: true, force: true });
await mkdir(resolve(releaseRoot, "scripts"), { recursive: true });

const nextSource = resolve(repositoryRoot, ".next");
await cp(nextSource, resolve(releaseRoot, ".next"), {
  recursive: true,
  filter: includeNextArtifact,
});
await cp(resolve(repositoryRoot, "public"), resolve(releaseRoot, "public"), {
  recursive: true,
});
await cp(resolve(repositoryRoot, "drizzle"), resolve(releaseRoot, "drizzle"), {
  recursive: true,
});

for (const file of [
  "database.mjs",
  "ensure-migrations.mjs",
  "doctor.mjs",
  "migrate.mjs",
  "seed.mjs",
  "create-admin.mjs",
  "generate-secret.mjs",
  "maintenance.mjs",
]) {
  await cp(
    resolve(repositoryRoot, "scripts", file),
    resolve(releaseRoot, "scripts", file),
  );
}

for (const file of [
  "server.js",
  "app_wrapper.cjs",
  "next.config.mjs",
  ".env.domainesia.example",
]) {
  await cp(resolve(repositoryRoot, file), resolve(releaseRoot, file));
}

const sourcePackage = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
);
const productionPackage = {
  name: sourcePackage.name,
  version: sourcePackage.version,
  private: true,
  type: "module",
  engines: sourcePackage.engines,
  scripts: {
    start: "node app_wrapper.cjs",
    "db:migrate": "node scripts/migrate.mjs",
    "db:doctor": "node scripts/doctor.mjs",
    "db:seed": "node scripts/seed.mjs",
    "admin:create": "node scripts/create-admin.mjs",
    maintenance: "node scripts/maintenance.mjs",
    "secret:generate": "node scripts/generate-secret.mjs",
  },
  dependencies: sourcePackage.dependencies,
  overrides: sourcePackage.overrides,
};
await writeFile(
  resolve(releaseRoot, "package.json"),
  `${JSON.stringify(productionPackage, null, 2)}\n`,
  "utf8",
);

await cp(
  resolve(repositoryRoot, "DOMAINESIA.md"),
  resolve(releaseRoot, "README.md"),
);
await cp(
  resolve(repositoryRoot, "VERSI-88.md"),
  resolve(releaseRoot, "VERSI-88.md"),
);

await assertPortableTree(releaseRoot);

console.log(`Paket upload siap di: ${releaseRoot}`);
console.log(
  "Kompres seluruh isi folder tersebut, lalu ekstrak di Application Root cPanel.",
);
console.log(
  "Jalankan pnpm domainesia:lock untuk membuat package-lock.json yang mandiri sebelum dikompres.",
);
