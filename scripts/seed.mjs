import { createDatabasePool } from "./database.mjs";

const seedTime = new Date("2026-07-26T05:00:00.000Z");

const directories = [
  [
    "umkm-anyaman-mekar-jaya",
    "umkm",
    "Anyaman Mekar Jaya",
    "Kerajinan",
    "Tas Eceng Gondok",
    "Tas anyaman ringan dengan detail buatan tangan. Cocok untuk penggunaan sehari-hari maupun oleh-oleh.",
    "Mulai Rp85.000",
    "6281234567801",
    "Desa Cipeundeuy",
    "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1000&q=88",
    "published",
    true,
  ],
  [
    "umkm-dapur-ibu-euis",
    "umkm",
    "Dapur Ibu Euis",
    "Kuliner",
    "Keripik Pisang Aneka Rasa",
    "Keripik renyah produksi rumahan dengan varian rasa original, manis, balado, dan cokelat.",
    "Mulai Rp15.000",
    "6281234567802",
    "Desa Cipeundeuy",
    "https://images.unsplash.com/photo-1528751014936-863e6e7a319c?auto=format&fit=crop&w=1000&q=88",
    "published",
    true,
  ],
  [
    "umkm-kue-nyi-iteung",
    "umkm",
    "Kue Nyi Iteung",
    "Kuliner",
    "Kue Tradisional",
    "Aneka kue basah dan jajanan pasar yang dibuat segar menggunakan resep keluarga.",
    "Mulai Rp20.000",
    "6281234567803",
    "Desa Cipeundeuy",
    "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1000&q=88",
    "published",
    true,
  ],
  [
    "umkm-kriya-cipeundeuy",
    "umkm",
    "Kriya Cipeundeuy",
    "Kerajinan",
    "Keranjang Serbaguna",
    "Keranjang dekoratif dari material alami, tersedia dalam beberapa ukuran dan pilihan warna.",
    "Mulai Rp65.000",
    "6281234567804",
    "Desa Cipeundeuy",
    "https://images.unsplash.com/photo-1777332546595-b28294e9084b?auto=format&fit=crop&w=1000&q=88",
    "published",
    false,
  ],
  [
    "service-ojek-mang-ujang",
    "service",
    "Ojek Desa Mang Ujang",
    "Transportasi",
    "Antar jemput dalam dan sekitar desa",
    "Melayani perjalanan warga, antar belanja, dan penjemputan dari titik sekitar Cipeundeuy.",
    "06.00 - 21.00",
    "6281234567811",
    "Desa Cipeundeuy",
    null,
    "published",
    false,
  ],
  [
    "service-angkut-berkah",
    "service",
    "Angkut Berkah",
    "Angkutan Barang",
    "Pickup untuk pindahan dan angkut hasil tani",
    "Tersedia untuk angkutan hasil panen, perabot, material ringan, dan kebutuhan pindahan lokal.",
    "Setiap hari",
    "6281234567812",
    "Desa Cipeundeuy",
    null,
    "published",
    false,
  ],
  [
    "service-bengkel-putra-jaya",
    "service",
    "Bengkel Putra Jaya",
    "Bengkel",
    "Servis motor, tambal ban, dan ganti oli",
    "Servis ringan dan perawatan rutin sepeda motor dengan konsultasi awal melalui WhatsApp.",
    "08.00 - 17.00",
    "6281234567813",
    "Desa Cipeundeuy",
    null,
    "published",
    false,
  ],
  [
    "service-jahit-teh-yani",
    "service",
    "Jahit Teh Yani",
    "Jahit",
    "Jahit pakaian, permak, dan seragam",
    "Menerima permak, pembuatan pakaian sederhana, seragam sekolah, dan pesanan kelompok.",
    "08.00 - 16.00",
    "6281234567814",
    "Desa Cipeundeuy",
    null,
    "published",
    false,
  ],
];

const newsEntries = [
  [
    "news-posyandu-juli-2026",
    "Pengumuman",
    "Pelayanan Posyandu Bulan Juli",
    "Posyandu balita dan lansia dilaksanakan di Aula Desa Cipeundeuy.",
    "Pendaftaran dimulai pukul 08.00 WIB. Warga diminta membawa buku kesehatan masing-masing.",
    "2026-07-18",
  ],
  [
    "news-jumat-bersih-juli-2026",
    "Agenda",
    "Jumat Bersih di Lingkungan Desa",
    "Warga diajak bergotong royong membersihkan lingkungan masing-masing.",
    "Kegiatan dimulai pukul 07.00 WIB dari titik kumpul setiap RW. Peralatan kebersihan dibawa secara mandiri.",
    "2026-07-12",
  ],
  [
    "news-pendataan-umkm-juli-2026",
    "Informasi",
    "Pendataan Pelaku UMKM Desa",
    "Pendaftaran direktori UMKM dan jasa lokal dibuka tanpa dipungut biaya.",
    "Siapkan nama usaha, foto produk atau jasa, lokasi, jam layanan, dan nomor WhatsApp yang dapat dihubungi.",
    "2026-07-05",
  ],
];

const pool = createDatabasePool(1);
const client = await pool.connect();

try {
  await client.query("BEGIN");

  for (const entry of directories) {
    await client.query(
      `
        INSERT INTO directory_entries (
          id, kind, name, category, title, description, meta, phone,
          public_location, image_url, status, featured, source, reviewed_by,
          created_at, updated_at, published_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17
        )
        ON CONFLICT (id) DO NOTHING
      `,
      [...entry, "seed", null, seedTime, seedTime, seedTime],
    );
  }

  await client.query(
    `
      INSERT INTO village_profile (
        id, head_name, head_title, greeting_lead, welcome_paragraph,
        closing_paragraph, population_count, household_count, rw_count,
        office_phone, office_email, service_hours_mon_thu, service_hours_friday,
        updated_at, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      "main",
      "Rusmana Dismartika",
      "Kepala Desa Cipeundeuy",
      "Assalamu’alaikum Warahmatullahi Wabarakatuh,",
      "Portal Desa Cipeundeuy memuat profil desa, kabar terbaru, UMKM, dan layanan warga. Informasi ini disediakan agar warga dan pengunjung lebih mudah menemukan hal yang dibutuhkan.",
      "Informasi di portal ini diperbarui oleh pengelola desa. Saran atau koreksi dapat disampaikan melalui kontak yang tersedia.",
      8742,
      2685,
      12,
      "+62 858-4685-8441",
      "desacipeundeuy113@gmail.com",
      "08.00 - 16.00 WIB",
      "08.00 - 16.30 WIB",
      seedTime,
      "seed",
    ],
  );

  for (const entry of newsEntries) {
    await client.query(
      `
        INSERT INTO news_entries (
          id, tag, title, summary, body, published_date, expires_at, status,
          author_email, created_at, updated_at, published_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        ...entry,
        null,
        "published",
        "seed",
        seedTime,
        seedTime,
        seedTime,
      ],
    );
  }

  await client.query("COMMIT");
  console.log("Data awal Portal Desa Cipeundeuy siap.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
