import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

async function migrationSource() {
  const directory = new URL("../drizzle/", import.meta.url);
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  assert.ok(names.length >= 1);
  const migrations = await Promise.all(
    names.map((name) => readFile(new URL(name, directory), "utf8")),
  );
  return migrations.join("\n");
}

test("builds the complete Portal Desa Cipeundeuy surface", async () => {
  const [page, layout] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/layout.tsx"),
    access(new URL("../.next/BUILD_ID", import.meta.url)),
  ]);

  assert.match(layout, /title:\s*"Portal Desa Cipeundeuy"/i);
  const hero = page.match(/<section className="hero" id="beranda">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(hero, "the first hero section is present");
  const heroHeading = hero.match(/<h1>([\s\S]*?)<\/h1>/)?.[1]
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(heroHeading, "DESA CIPEUNDEUY");
  assert.match(hero, /<p>\s*Dari Desa, Tumbuh Bersama\.\s*<\/p>/);
  assert.match(page, /Belanja produk Cipeundeuy/);
  assert.match(page, /Hubungi via WhatsApp/);
  assert.match(page, /Buka formulir pendaftaran/);
  assert.match(page, /Peta kawasan Desa Cipeundeuy/);
  assert.match(page, /Kantor Desa Cipeundeuy/);
  assert.match(page, /zoom:\s*17/);
  assert.match(page, /google\.com\/maps\/dir\/\?api=1/);
  assert.match(page, /destination_place_id/);
  assert.match(layout, /og\.png/);
  assert.doesNotMatch(page, /Your site is taking shape/i);
});

test("keeps card interactions accessible, responsive, and motion-aware", async () => {
  const [page, css] = await Promise.all([
    source("../app/page.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(page, /aria-expanded=\{isActive\}/);
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /document\.addEventListener\("pointerdown"/);
  assert.match(page, /element\.dataset\.arrowTouch = state/);
  assert.match(page, /moved > 12/);
  assert.match(page, /Muat lebih banyak/);
  assert.match(page, /BUSINESS_PAGE_SIZE = 8/);
  assert.match(page, /SERVICE_PAGE_SIZE = 4/);
  assert.match(page, /className="shell village-stats"/);

  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.potential-grid:not\(:has\(\.potential\.active\)\)/);
  assert.match(css, /\.arrow-action:hover/);
  assert.match(css, /\.arrow-action:active/);
  assert.match(css, /\.arrow-glyph/);
  assert.match(css, /\.product-card:hover/);
  assert.match(css, /\.gallery-tile:focus-visible/);
  assert.match(css, /data-arrow-touch="engaged"/);
  assert.match(css, /data-arrow-touch="activated"/);
  assert.match(css, /touch-action: manipulation/);
  assert.match(
    css,
    /repeat\(auto-fill, minmax\(min\(100%, 320px\), 1fr\)\)/,
  );
  assert.match(css, /\.small-link-arrow/);
});

test("uses Next.js and PostgreSQL behind the DomaiNesia Passenger entrypoint", async () => {
  const [
    packageRaw,
    schema,
    database,
    migration,
    login,
    rateLimiter,
    server,
    wrapper,
    nextConfig,
    lockScript,
  ] = await Promise.all([
    source("../package.json"),
    source("../db/schema.ts"),
    source("../db/index.ts"),
    migrationSource(),
    source("../app/api/auth/login/route.ts"),
    source("../app/request-rate-limit.ts"),
    source("../server.js"),
    source("../app_wrapper.cjs"),
    source("../next.config.mjs"),
    source("../scripts/lock-domainesia.mjs"),
  ]);
  const packageJson = JSON.parse(packageRaw);

  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.equal(packageJson.scripts.start, "next start");
  assert.equal(packageJson.scripts["domainesia:build"], "next build --webpack");
  assert.match(packageJson.scripts["domainesia:package"], /package-domainesia\.mjs/);
  assert.equal(
    packageJson.scripts["domainesia:lock"],
    "node scripts/lock-domainesia.mjs",
  );
  assert.match(lockScript, /npm@10\.9\.4/);
  assert.match(lockScript, /cwd: releaseRoot/);
  assert.match(lockScript, /name\.startsWith\("\.\."\)/);
  assert.equal(packageJson.scripts["domainesia:start"], "node app_wrapper.cjs");
  assert.equal(packageJson.dependencies.pg, "8.16.3");
  assert.equal(packageJson.overrides.sharp, "0.35.3");
  assert.equal(packageJson.overrides.postcss, "8.5.25");
  assert.equal(packageJson.devDependencies.wrangler, undefined);
  assert.equal(packageJson.devDependencies.vinext, undefined);

  assert.match(schema, /pgTable\(\s*"directory_entries"/);
  assert.match(schema, /pgTable\(\s*"admin_users"/);
  assert.match(schema, /pgTable\(\s*"admin_sessions"/);
  assert.match(schema, /pgTable\("admin_login_rate_limits"/);
  assert.match(schema, /timestamp\(/);
  assert.match(database, /drizzle-orm\/node-postgres/);
  assert.match(database, /new Pool/);
  assert.match(database, /process\.env\.PGPOOL_MAX \|\| "3"/);
  assert.match(database, /Math\.min\(5, Math\.max\(1, parsed\)\)/);
  assert.match(migration, /CREATE TABLE "directory_entries"/);
  assert.match(migration, /CREATE TABLE "admin_users"/);
  assert.match(migration, /CREATE TABLE "admin_login_rate_limits"/);
  assert.match(migration, /FOREIGN KEY \("directory_entry_id"\)/);
  assert.match(login, /consumeRateLimit/);
  assert.match(rateLimiter, /ON CONFLICT \(bucket_key\) DO UPDATE/);
  assert.match(rateLimiter, /INTERVAL '1 second'/);
  assert.match(wrapper, /import\("\.\/server\.js"\)/);
  assert.match(wrapper, /\.catch\(\(error\)/);
  assert.match(server, /await import\("next"\)/);
  assert.match(server, /process\.env\.PORT/);
  assert.match(server, /server\.listen\(port, hostname/);
  assert.doesNotMatch(nextConfig, /output:\s*["']standalone["']/);
  assert.doesNotMatch(
    [packageRaw, schema, database, login, rateLimiter, server, wrapper].join(
      "\n",
    ),
    /cloudflare:workers|drizzle-orm\/d1|wrangler|vinext/i,
  );
});

test("manages Kabar Desa, village profile, and public statistics", async () => {
  const [
    page,
    schema,
    publicContent,
    adminContent,
    profileImage,
    media,
    dashboard,
    manager,
    seed,
  ] = await Promise.all([
      source("../app/page.tsx"),
      source("../db/schema.ts"),
      source("../app/api/content/route.ts"),
      source("../app/api/admin/content/route.ts"),
      source("../app/api/admin/content/profile-image/route.ts"),
      source("../app/api/media/[key]/route.ts"),
      source("../app/kelola/AdminDashboard.tsx"),
      source("../app/kelola/ContentManager.tsx"),
      source("../scripts/seed.mjs"),
    ]);

  assert.match(schema, /pgTable\(\s*"news_entries"/);
  assert.match(schema, /pgTable\("village_profile"/);
  assert.match(publicContent, /eq\(newsEntries\.status, "published"\)/);
  assert.match(publicContent, /registeredUmkmCount/);
  assert.match(schema, /profileImageKey/);
  assert.match(adminContent, /resource === "profile"/);
  assert.match(adminContent, /resource === "news"/);
  assert.match(adminContent, /householdCount > populationCount/);
  assert.match(dashboard, /Pendaftaran/);
  assert.match(dashboard, /Kabar Desa/);
  assert.match(dashboard, /Profil & Statistik/);
  assert.match(dashboard, /admin-sidebar/);
  assert.match(dashboard, /admin-tab-code/);
  assert.match(dashboard, /moveTabFocus/);
  assert.match(manager, /UMKM Terdaftar/);
  assert.match(manager, /readOnly/);
  assert.match(manager, /Foto Mengenal Desa/);
  assert.match(manager, /profile-image-upload/);
  assert.match(profileImage, /requestAdminMutation\(request\)/);
  assert.match(profileImage, /villageProfileMediaKey/);
  assert.match(media, /validVillageProfileMediaKey/);
  assert.match(page, /villageProfileImageUrl/);
  assert.match(page, /Masuk Pengelola/);
  assert.match(page, /tanpa membuat akun/);
  assert.match(seed, /Rusmana Dismartika/);
  assert.match(seed, /Assalamu/);
});

test("keeps scalable directory ranking, price normalization, and pagination", async () => {
  const [price, page, route, clickRoute, analytics, moderation] =
    await Promise.all([
      import("../app/directory-price.ts"),
      source("../app/page.tsx"),
      source("../app/api/directory/route.ts"),
      source("../app/api/directory/click/route.ts"),
      source("../app/directory-analytics.ts"),
      source("../app/kelola/ModerationPanel.tsx"),
    ]);

  for (const value of [
    "85000",
    "Rp85.000",
    "Mulai Rp85.000",
    "85.000",
    "Rp 85 000",
  ]) {
    assert.equal(price.normalizeDirectoryPrice(value), "Mulai Rp85.000");
  }
  for (const value of ["", "0", "-85000", "85.00", "85 ribu", "10-20"]) {
    assert.equal(price.normalizeDirectoryPrice(value), null);
  }

  assert.match(route, /ilike\(directoryEntries\.name/);
  assert.match(route, /NULLS LAST/);
  assert.match(route, /\.limit\(options\.limit \+ 1\)/);
  assert.match(route, /\.offset\(options\.offset\)/);
  assert.match(route, /MAX_PAGE_SIZE = 24/);
  assert.match(route, /countDistinct\(directoryClickEvents\.visitorHash\)/);
  assert.match(route, /FEATURED_MIN_VISITORS = 3/);
  assert.match(clickRoute, /MAX_NETWORK_EVENTS_PER_DAY = 30/);
  assert.match(clickRoute, /onConflictDoNothing/);
  assert.match(analytics, /getAnalyticsSalt/);
  assert.match(analytics, /hmacSha256Base64Url/);
  assert.match(page, /Produk yang sering dibuka melalui WhatsApp tampil lebih awal/);
  assert.match(page, /Harga mulai \(Rp\)/);
  assert.match(moderation, /whatsappUniqueVisitors30d/);
  assert.match(moderation, /Sering dibuka/);
});

test("packages a portable DomaiNesia cPanel release with operational tooling", async () => {
  const [
    health,
    packager,
    guide,
    environment,
    adminCli,
    maintenance,
    doctor,
    migrationGuard,
    server,
  ] = await Promise.all([
    source("../app/api/health/route.ts"),
    source("../scripts/package-domainesia.mjs"),
    source("../DOMAINESIA.md"),
    source("../.env.domainesia.example"),
    source("../scripts/create-admin.mjs"),
    source("../scripts/maintenance.mjs"),
    source("../scripts/doctor.mjs"),
    source("../scripts/ensure-migrations.mjs"),
    source("../server.js"),
  ]);

  assert.match(health, /SELECT image_key, icon_key FROM directory_entries LIMIT 0/);
  assert.match(health, /"cache-control": "no-store"/);
  assert.match(health, /classifyOperationalError/);
  assert.match(health, /PORTAL_RELEASE/);

  assert.match(packager, /resolve\(releaseParent, "domainesia"\)/);
  assert.match(packager, /resolve\(repositoryRoot, "\.next", "BUILD_ID"\)/);
  assert.match(packager, /path === "standalone"/);
  assert.match(packager, /path\.endsWith\("\.nft\.json"\)/);
  assert.match(packager, /resolve\(repositoryRoot, "\.next", "node_modules"\)/);
  assert.match(packager, /metadata\.isSymbolicLink\(\)/);
  assert.match(packager, /extname\(target\)\.toLowerCase\(\) === "\.node"/);
  assert.match(packager, /resolve\(repositoryRoot, "public"\)/);
  assert.match(packager, /resolve\(repositoryRoot, "drizzle"\)/);
  assert.match(packager, /"seed\.mjs"/);
  assert.match(packager, /"doctor\.mjs"/);
  assert.match(packager, /"ensure-migrations\.mjs"/);
  assert.match(packager, /"app_wrapper\.cjs"/);
  assert.match(packager, /start: "node app_wrapper\.cjs"/);
  assert.match(packager, /dependencies: sourcePackage\.dependencies/);
  assert.match(packager, /overrides: sourcePackage\.overrides/);
  assert.doesNotMatch(packager, /devDependencies:\s*sourcePackage\.devDependencies/);
  assert.match(packager, /resolve\(repositoryRoot, "DOMAINESIA\.md"\)/);
  assert.match(packager, /resolve\(releaseRoot, "README\.md"\)/);

  assert.match(guide, /shared hosting DomaiNesia/i);
  assert.match(guide, /Setup Node\.js App/);
  assert.match(guide, /Application startup file:\*\* `app_wrapper\.cjs`/);
  assert.match(guide, /release\/domainesia/);
  assert.match(guide, /package-lock\.json/);
  assert.match(guide, /Run NPM Install/);
  assert.match(guide, /npm run db:migrate/);
  assert.match(guide, /npm run db:doctor/);
  assert.match(guide, /npm run admin:create/);
  assert.match(guide, /JetBackup/);
  assert.doesNotMatch(guide, /docker compose|VPS Rumahweb/i);

  assert.match(environment, /APP_URL=/);
  assert.match(environment, /TRUST_PROXY="false"/);
  assert.match(environment, /AUTO_MIGRATE="true"/);
  assert.match(environment, /PGHOST=/);
  assert.match(environment, /PGDATABASE=/);
  assert.match(environment, /PGUSER=/);
  assert.match(environment, /PGPOOL_MAX="3"/);

  assert.match(adminCli, /BEGIN/);
  assert.match(adminCli, /ROLLBACK/);
  assert.match(adminCli, /ON CONFLICT \(email\) DO UPDATE/);
  assert.match(adminCli, /DELETE FROM admin_sessions/);
  assert.doesNotMatch(adminCli, /spawnSync|wrangler|--remote|--local/);
  assert.match(maintenance, /DELETE FROM admin_login_rate_limits/);
  assert.match(maintenance, /DELETE FROM directory_click_events/);
  assert.match(doctor, /Struktur PostgreSQL Versi 88 lengkap/);
  assert.match(doctor, /Folder media dapat ditulis/);
  assert.match(migrationGuard, /pg_advisory_lock/);
  assert.match(migrationGuard, /pg_advisory_unlock/);
  assert.match(server, /AUTO_MIGRATE !== "false"/);
  assert.match(server, /ensureDatabaseMigrations/);
  assert.match(server, /dir: applicationRoot/);
});
