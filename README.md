# Portal Desa Cipeundeuy

Portal Desa Cipeundeuy adalah website informasi desa yang menyediakan profil desa, potensi lokal, UMKM, layanan masyarakat, Kabar Desa, galeri, peta, dan panel pengelola.

## Fitur

- Profil dan informasi desa
- Data dan statistik desa
- Potensi desa
- Direktori UMKM dan produk lokal
- Direktori jasa masyarakat
- Kabar Desa
- Galeri
- Peta lokasi
- Kontak WhatsApp
- Pendaftaran UMKM dan jasa
- Panel pengelola
- Moderasi pengajuan

## Teknologi

- Next.js
- React
- TypeScript
- Tailwind CSS
- PostgreSQL
- Drizzle ORM
- Node.js

## Menjalankan Project

Install dependency:

```bash
pnpm install
```

Salin file environment:

```bash
cp .env.example .env
```

Jalankan migration database:

```bash
pnpm db:migrate
```

Jalankan development server:

```bash
pnpm dev
```

Aplikasi dapat diakses melalui:

```text
http://localhost:3000
```

## Deployment

Project dapat dijalankan pada platform yang mendukung:

- Node.js
- PostgreSQL
- Environment variables

Production build:

```bash
pnpm build
```

Konfigurasi deployment dapat disesuaikan dengan platform hosting yang digunakan.

## Environment

Contoh konfigurasi tersedia pada:

```text
.env.example
```

Data sensitif seperti kredensial database, secret autentikasi, token, dan API key tidak disertakan dalam repository.

## Struktur Utama

```text
app/
db/
drizzle/
public/
scripts/
server.js
.env.example
```

## Tentang Project

Portal ini dibuat untuk membantu masyarakat mengakses informasi Desa Cipeundeuy serta memperkenalkan potensi, UMKM, produk, dan jasa lokal melalui media digital.

---

**Portal Desa Cipeundeuy**  
*Dari Desa, Tumbuh Bersama.*