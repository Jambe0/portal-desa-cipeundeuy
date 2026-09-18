import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/app/admin-auth";
import { safeReturnTo } from "@/app/auth/security";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  if (await currentAdmin()) redirect(returnTo);

  return (
    <main className="admin-page admin-login-page">
      <section className="admin-login-card">
        <Link
          className="brand"
          href="/"
          aria-label="Kembali ke Portal Desa Cipeundeuy"
        >
          <Image
            className="brand-mark"
            src="/logo-kabupaten-bandung-barat.png"
            alt=""
            width={38}
            height={38}
            priority
          />
          <span>
            <strong>CIPEUNDEUY</strong>
            <small>PANEL PENGELOLA</small>
          </span>
        </Link>
        <div className="admin-login-copy">
          <span className="eyebrow">AKSES PENGELOLA</span>
          <h1>Masuk untuk mengelola portal.</h1>
          <p>
            Halaman ini khusus pengelola resmi Desa Cipeundeuy. Pengunjung umum
            tetap dapat membuka seluruh informasi dan mendaftarkan UMKM atau
            layanan tanpa akun. Gunakan email dan kunci akses yang dibuat saat
            akun pengelola disiapkan.
          </p>
        </div>
        <LoginForm returnTo={returnTo} />
        <Link className="admin-back-link" href="/">
          Kembali ke portal
        </Link>
      </section>
    </main>
  );
}
