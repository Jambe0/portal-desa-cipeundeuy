import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/app/admin-auth";
import AdminDashboard from "./AdminDashboard";
import AdminLogoutButton from "./AdminLogoutButton";

export const dynamic = "force-dynamic";

async function ProtectedVillageManager() {
  const admin = await currentAdmin();
  if (!admin) redirect("/kelola/masuk?returnTo=%2Fkelola");

  return (
    <main className="admin-page">
      <header className="admin-header">
        <Link
          className="admin-compact-brand"
          href="/"
          aria-label="Kembali ke Portal Desa Cipeundeuy"
        >
          <strong>CIPEUNDEUY</strong>
          <span>Pusat kelola</span>
        </Link>
        <div className="admin-header-actions">
          <div className="admin-user">
            <span className="admin-user-identity">
              <small>Pengelola aktif</small>
              <strong>{admin.displayName}</strong>
            </span>
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      <section className="admin-shell">
        <div className="admin-intro">
          <div className="admin-intro-copy">
            <span className="eyebrow light">PUSAT PENGELOLAAN</span>
            <h1>Kelola Portal Desa</h1>
            <p>
              Periksa pendaftaran warga, perbarui kabar desa, serta ubah profil
              dan statistik desa di sini.
            </p>
          </div>
          <div className="admin-sync-note">
            <span className="admin-sync-label">
              Perubahan portal
            </span>
            <p>
              Perubahan yang disimpan akan muncul setelah portal memperbarui data.
            </p>
          </div>
        </div>
        <AdminDashboard />
      </section>
    </main>
  );
}

export default function VillageManagerPage() {
  return (
    <Suspense
      fallback={
        <main className="admin-page admin-loading">
          <p>Menyiapkan panel pengelola&hellip;</p>
        </main>
      }
    >
      <ProtectedVillageManager />
    </Suspense>
  );
}
