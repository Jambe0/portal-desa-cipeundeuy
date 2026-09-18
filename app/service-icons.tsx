type ServiceIconSource = {
  type?: string;
  name?: string;
  detail?: string;
  extra?: string;
  iconKey?: string | null;
};

export const SERVICE_ICON_CATALOG = [
  { key: "motorcycle", label: "Ojek / motor", className: "fa-solid fa-motorcycle" },
  { key: "truck-pickup", label: "Angkutan barang", className: "fa-solid fa-truck-pickup" },
  { key: "box", label: "Kurir / paket", className: "fa-solid fa-box" },
  { key: "bus", label: "Bus / travel", className: "fa-solid fa-bus-simple" },
  { key: "car", label: "Mobil / antar jemput", className: "fa-solid fa-car-side" },
  { key: "computer", label: "Komputer", className: "fa-solid fa-computer" },
  { key: "mobile", label: "Ponsel", className: "fa-solid fa-mobile-screen-button" },
  { key: "print", label: "Cetak / fotokopi", className: "fa-solid fa-print" },
  { key: "bolt", label: "Elektronik", className: "fa-solid fa-bolt" },
  { key: "tools", label: "Bengkel / servis", className: "fa-solid fa-screwdriver-wrench" },
  { key: "plug", label: "Kelistrikan", className: "fa-solid fa-plug-circle-bolt" },
  { key: "droplet", label: "Air / pipa", className: "fa-solid fa-droplet" },
  { key: "hammer", label: "Bangunan / pertukangan", className: "fa-solid fa-hammer" },
  { key: "scissors", label: "Jahit / permak", className: "fa-solid fa-scissors" },
  { key: "shirt", label: "Laundry", className: "fa-solid fa-shirt" },
  { key: "broom", label: "Kebersihan", className: "fa-solid fa-broom" },
  { key: "camera", label: "Foto / video", className: "fa-solid fa-camera" },
  { key: "paint", label: "Cat / dekorasi", className: "fa-solid fa-paint-roller" },
  { key: "utensils", label: "Katering / kuliner", className: "fa-solid fa-utensils" },
  { key: "education", label: "Les / pelatihan", className: "fa-solid fa-graduation-cap" },
  { key: "health", label: "Kesehatan", className: "fa-solid fa-heart-pulse" },
  { key: "tractor", label: "Pertanian", className: "fa-solid fa-tractor" },
  { key: "tree", label: "Kebun / pohon", className: "fa-solid fa-tree" },
  { key: "paw", label: "Hewan / ternak", className: "fa-solid fa-paw" },
  { key: "briefcase", label: "Jasa umum", className: "fa-solid fa-briefcase" },
] as const;

export type ServiceIconKey = (typeof SERVICE_ICON_CATALOG)[number]["key"];

const SERVICE_ICON_BY_KEY = new Map(
  SERVICE_ICON_CATALOG.map((item) => [item.key, item] as const),
);

export function isServiceIconKey(value: unknown): value is ServiceIconKey {
  return typeof value === "string" && SERVICE_ICON_BY_KEY.has(value as ServiceIconKey);
}

const SERVICE_ICON_RULES = [
  {
    keywords: ["ojek", "ojol", "antar motor"],
    iconKey: "motorcycle",
  },
  {
    keywords: ["angkut", "pickup", "pindahan", "truk", "kargo", "logistik"],
    iconKey: "truck-pickup",
  },
  {
    keywords: ["kurir", "paket", "pengiriman", "delivery"],
    iconKey: "box",
  },
  {
    keywords: ["bus", "travel", "shuttle"],
    iconKey: "bus",
  },
  {
    keywords: ["taksi", "rental mobil", "sopir", "transportasi", "antar jemput"],
    iconKey: "car",
  },
  {
    keywords: ["komputer", "laptop", "pc"],
    iconKey: "computer",
  },
  {
    keywords: ["hp", "ponsel", "smartphone"],
    iconKey: "mobile",
  },
  {
    keywords: ["printer", "fotokopi", "cetak"],
    iconKey: "print",
  },
  {
    keywords: ["elektronik", "ac", "kulkas", "mesin cuci"],
    iconKey: "bolt",
  },
  {
    keywords: ["bengkel", "tambal ban", "ganti oli", "mekanik", "servis motor"],
    iconKey: "tools",
  },
  {
    keywords: ["listrik", "instalasi listrik"],
    iconKey: "plug",
  },
  {
    keywords: ["ledeng", "plumbing", "pipa", "sumur"],
    iconKey: "droplet",
  },
  {
    keywords: ["tukang", "renovasi", "bangunan", "konstruksi", "las", "kayu", "mebel"],
    iconKey: "hammer",
  },
  {
    keywords: ["jahit", "permak", "konveksi", "tailor"],
    iconKey: "scissors",
  },
  {
    keywords: ["laundry", "cuci setrika"],
    iconKey: "shirt",
  },
  {
    keywords: ["kebersihan", "bersih bersih"],
    iconKey: "broom",
  },
  {
    keywords: ["foto", "video", "dokumentasi"],
    iconKey: "camera",
  },
  {
    keywords: ["cat", "pengecatan", "dekorasi"],
    iconKey: "paint",
  },
  {
    keywords: ["katering", "catering", "masak", "dapur", "kuliner"],
    iconKey: "utensils",
  },
  {
    keywords: ["les", "guru", "bimbel", "kursus", "pelatihan"],
    iconKey: "education",
  },
  {
    keywords: ["kesehatan", "bidan", "perawat", "klinik", "terapi"],
    iconKey: "health",
  },
  {
    keywords: ["tani", "sawah", "traktor"],
    iconKey: "tractor",
  },
  {
    keywords: ["kebun", "tebang pohon"],
    iconKey: "tree",
  },
  {
    keywords: ["hewan", "ternak", "veteriner"],
    iconKey: "paw",
  },
] as const satisfies ReadonlyArray<{
  keywords: readonly string[];
  iconKey: ServiceIconKey;
}>;

function normalizeServiceText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resolveServiceIconClass(service: ServiceIconSource) {
  if (isServiceIconKey(service.iconKey)) {
    return SERVICE_ICON_BY_KEY.get(service.iconKey)?.className ?? "fa-solid fa-briefcase";
  }

  const searchableText = normalizeServiceText(
    [service.type, service.name, service.detail, service.extra]
      .filter(Boolean)
      .join(" "),
  );

  const inferredKey = SERVICE_ICON_RULES.find(({ keywords }) =>
    keywords.some((keyword) => searchableText.includes(keyword)),
  )?.iconKey;

  return inferredKey
    ? SERVICE_ICON_BY_KEY.get(inferredKey)?.className ?? "fa-solid fa-briefcase"
    : "fa-solid fa-briefcase";
}

export function ServiceCategoryIcon({ service }: { service: ServiceIconSource }) {
  return (
    <i
      className={resolveServiceIconClass(service)}
      data-icon-provider="font-awesome"
      aria-hidden="true"
    />
  );
}
