"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  SERVICE_ICON_CATALOG,
  ServiceCategoryIcon,
  type ServiceIconKey,
} from "./service-icons";

const nav = [
  ["Beranda", "beranda"],
  ["Profil", "profil"],
  ["UMKM", "umkm"],
  ["Layanan", "layanan"],
  ["Informasi", "informasi"],
  ["Kontak", "kontak"],
];

const villageLocation = {
  name: "Kantor Desa Cipeundeuy",
  address:
    "Jl. Raya Cipeundeuy No. 587, Desa Cipeundeuy, Kecamatan Cipeundeuy, Kabupaten Bandung Barat, Jawa Barat 40558",
  query:
    "Kantor Desa Cipeundeuy, Jl. Raya Cipeundeuy No. 587, Kecamatan Cipeundeuy, Kabupaten Bandung Barat, Jawa Barat 40558",
  placeId: "ChIJB5ak7ZgBaS4RLzrFL_O2y0E",
  mapCenter: "-6.7398,107.3618",
  zoom: 17,
};

const defaultVillageContact = {
  officePhone: "+62 858-4685-8441",
  officeEmail: "desacipeundeuy113@gmail.com",
  serviceHoursMonThu: "08.00 - 16.00 WIB",
  serviceHoursFriday: "08.00 - 16.30 WIB",
};

type Business = {
  id: string;
  name: string;
  category: string;
  product: string;
  price: string;
  description: string;
  image: string;
  position: string;
  phone: string;
  featured: boolean;
};

type LocalService = {
  id: string;
  name: string;
  type: string;
  detail: string;
  hours: string;
  extra: string;
  phone: string;
  iconKey?: string | null;
  featured: boolean;
};

type DirectoryPayload = {
  businesses?: Business[];
  services?: LocalService[];
  categories?: string[];
  pagination?: {
    businesses?: DirectoryPageInfo;
    services?: DirectoryPageInfo;
  };
  error?: string;
};

type DirectoryPageInfo = {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

const BUSINESS_PAGE_SIZE = 8;
const SERVICE_PAGE_SIZE = 4;
const DIRECTORY_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DIRECTORY_IMAGE_TARGET_BYTES = 900 * 1024;
const DIRECTORY_IMAGE_MAX_EDGE = 1600;
const DIRECTORY_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const SERVICE_CATEGORIES = [
  "Transportasi",
  "Ojek & Antar Jemput",
  "Angkutan Barang",
  "Kurir & Pengiriman",
  "Bengkel & Servis",
  "Jahit & Konveksi",
  "Laundry",
  "Elektronik",
  "Komputer & Ponsel",
  "Bangunan & Pertukangan",
  "Fotografi & Dokumentasi",
  "Kuliner & Katering",
  "Pendidikan & Pelatihan",
  "Kesehatan",
  "Pertanian & Peternakan",
  "Layanan Lainnya",
] as const;

type PreparedDirectoryImage = {
  file: File;
  originalName: string;
  originalBytes: number;
  compressedBytes: number;
  width: number;
  height: number;
  previewUrl: string;
};

function formatDirectoryFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  })} MB`;
}

function directoryImageExtensionSupported(file: File) {
  return /\.(?:jpe?g|png|webp)$/i.test(file.name);
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(
            new Error(
              "Peramban ini belum dapat mengubah foto ke WebP. Gunakan versi peramban terbaru.",
            ),
          );
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });
}

async function decodeDirectoryImage(file: File) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  }

  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = sourceUrl;

  try {
    await image.decode();
    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(sourceUrl),
    };
  } catch {
    URL.revokeObjectURL(sourceUrl);
    throw new Error("Foto tidak dapat dibaca. Pilih berkas JPG, PNG, atau WebP lain.");
  }
}

async function prepareDirectoryImage(file: File) {
  const decoded = await decodeDirectoryImage(file);

  try {
    if (!decoded.width || !decoded.height) {
      throw new Error("Ukuran foto tidak dapat dikenali.");
    }

    const initialScale = Math.min(
      1,
      DIRECTORY_IMAGE_MAX_EDGE / Math.max(decoded.width, decoded.height),
    );
    let width = Math.max(1, Math.round(decoded.width * initialScale));
    let height = Math.max(1, Math.round(decoded.height * initialScale));
    let smallestBlob: Blob | null = null;
    let finalWidth = width;
    let finalHeight = height;
    const qualitySteps = [0.82, 0.74, 0.66, 0.58, 0.5];

    for (let sizePass = 0; sizePass < 3; sizePass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Foto belum dapat diproses di perangkat ini.");

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const blob = await canvasToWebp(canvas, quality);
        if (!smallestBlob || blob.size < smallestBlob.size) {
          smallestBlob = blob;
          finalWidth = width;
          finalHeight = height;
        }
        if (blob.size <= DIRECTORY_IMAGE_TARGET_BYTES) {
          smallestBlob = blob;
          finalWidth = width;
          finalHeight = height;
          break;
        }
      }

      if (smallestBlob && smallestBlob.size <= DIRECTORY_IMAGE_TARGET_BYTES) {
        break;
      }

      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }

    if (!smallestBlob) throw new Error("Foto belum dapat dikompresi.");

    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto-produk";
    return {
      file: new File([smallestBlob], `${baseName}.webp`, {
        type: "image/webp",
        lastModified: Date.now(),
      }),
      width: finalWidth,
      height: finalHeight,
    };
  } finally {
    decoded.release();
  }
}

type NewsItem = {
  id: string;
  publishedDate: string;
  date: string;
  month: string;
  tag: string;
  title: string;
  text: string;
  extra: string;
};

type VillageProfileData = {
  headName: string;
  headTitle: string;
  greetingLead: string;
  welcomeParagraph: string;
  closingParagraph: string;
  profileImageKey?: string | null;
  officePhone?: string | null;
  officeEmail?: string | null;
  serviceHoursMonThu?: string | null;
  serviceHoursFriday?: string | null;
};

type VillageStatistics = {
  populationCount: number;
  householdCount: number;
  rwCount: number;
  registeredUmkmCount: number | null;
};

type ContentPayload = {
  profile?: VillageProfileData | null;
  statistics?: VillageStatistics;
  news?: Array<{
    id: string;
    tag: string;
    title: string;
    summary: string;
    body: string;
    publishedDate: string;
  }>;
  error?: string;
};

const defaultVillageStatistics: VillageStatistics = {
  populationCount: 8742,
  householdCount: 2685,
  rwCount: 12,
  registeredUmkmCount: null,
};

const defaultVillageProfile: VillageProfileData = {
  headName: "Rusmana Dismartika",
  headTitle: "Kepala Desa Cipeundeuy",
  greetingLead: "Assalamu’alaikum Warahmatullahi Wabarakatuh,",
  welcomeParagraph:
    "Portal Desa Cipeundeuy memuat profil desa, kabar terbaru, UMKM, dan layanan warga. Informasi ini disediakan agar warga dan pengunjung lebih mudah menemukan hal yang dibutuhkan.",
  closingParagraph:
    "Informasi di portal ini diperbarui oleh pengelola desa. Saran atau koreksi dapat disampaikan melalui kontak yang tersedia.",
  profileImageKey: null,
  ...defaultVillageContact,
};

const potentials = [
  {
    label: "KERAJINAN LOKAL",
    title: "Anyaman eceng gondok",
    text: "Tas, keranjang, dan perlengkapan rumah buatan warga.",
    filter: "Kerajinan",
    action: "Lihat kerajinan",
  },
  {
    label: "OLAHAN RUMAHAN",
    title: "Makanan dari warga",
    text: "Kudapan, kue tradisional, dan aneka olahan produksi rumahan.",
    filter: "Kuliner",
    action: "Lihat kuliner",
  },
] satisfies Array<{
  label: string;
  title: string;
  text: string;
  filter: string;
  action: string;
}>;

const businesses: Business[] = [
  {
    id: "umkm-anyaman-mekar-jaya",
    name: "Anyaman Mekar Jaya",
    category: "Kerajinan",
    product: "Tas Eceng Gondok",
    price: "Mulai Rp85.000",
    description: "Tas anyaman ringan dengan detail buatan tangan. Cocok untuk penggunaan sehari-hari maupun oleh-oleh.",
    image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1000&q=88",
    position: "50% 48%",
    phone: "6281234567801",
    featured: true,
  },
  {
    id: "umkm-dapur-ibu-euis",
    name: "Dapur Ibu Euis",
    category: "Kuliner",
    product: "Keripik Pisang Aneka Rasa",
    price: "Mulai Rp15.000",
    description: "Keripik renyah produksi rumahan dengan varian rasa original, manis, balado, dan cokelat.",
    image: "https://images.unsplash.com/photo-1528751014936-863e6e7a319c?auto=format&fit=crop&w=1000&q=88",
    position: "50% 52%",
    phone: "6281234567802",
    featured: true,
  },
  {
    id: "umkm-kue-nyi-iteung",
    name: "Kue Nyi Iteung",
    category: "Kuliner",
    product: "Kue Tradisional",
    price: "Mulai Rp20.000",
    description: "Aneka kue basah dan jajanan pasar yang dibuat segar menggunakan resep keluarga.",
    image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1000&q=88",
    position: "50% 52%",
    phone: "6281234567803",
    featured: true,
  },
  {
    id: "umkm-kriya-cipeundeuy",
    name: "Kriya Cipeundeuy",
    category: "Kerajinan",
    product: "Keranjang Serbaguna",
    price: "Mulai Rp65.000",
    description: "Keranjang dekoratif dari material alami, tersedia dalam beberapa ukuran dan pilihan warna.",
    image: "https://images.unsplash.com/photo-1777332546595-b28294e9084b?auto=format&fit=crop&w=1000&q=88",
    position: "50% 50%",
    phone: "6281234567804",
    featured: false,
  },
];

const services: LocalService[] = [
  {
    id: "service-ojek-mang-ujang",
    name: "Ojek Desa Mang Ujang",
    type: "Transportasi",
    detail: "Antar jemput dalam dan sekitar desa",
    hours: "06.00 - 21.00",
    extra: "Melayani perjalanan warga, antar belanja, dan penjemputan dari titik sekitar Cipeundeuy.",
    phone: "6281234567811",
    featured: false,
  },
  {
    id: "service-angkut-berkah",
    name: "Angkut Berkah",
    type: "Angkutan Barang",
    detail: "Pickup untuk pindahan dan angkut hasil tani",
    hours: "Setiap hari",
    extra: "Tersedia untuk angkutan hasil panen, perabot, material ringan, dan kebutuhan pindahan lokal.",
    phone: "6281234567812",
    featured: false,
  },
  {
    id: "service-bengkel-putra-jaya",
    name: "Bengkel Putra Jaya",
    type: "Bengkel",
    detail: "Servis motor, tambal ban, dan ganti oli",
    hours: "08.00 - 17.00",
    extra: "Servis ringan dan perawatan rutin sepeda motor dengan konsultasi awal melalui WhatsApp.",
    phone: "6281234567813",
    featured: false,
  },
  {
    id: "service-jahit-teh-yani",
    name: "Jahit Teh Yani",
    type: "Jahit",
    detail: "Jahit pakaian, permak, dan seragam",
    hours: "08.00 - 16.00",
    extra: "Menerima permak, pembuatan pakaian sederhana, seragam sekolah, dan pesanan kelompok.",
    phone: "6281234567814",
    featured: false,
  },
];

const info: NewsItem[] = [
  {
    id: "news-posyandu-juli-2026",
    publishedDate: "2026-07-18",
    date: "18",
    month: "JUL",
    tag: "Pengumuman",
    title: "Pelayanan Posyandu Bulan Juli",
    text: "Posyandu balita dan lansia dilaksanakan di Aula Desa Cipeundeuy.",
    extra: "Pendaftaran dimulai pukul 08.00 WIB. Warga diminta membawa buku kesehatan masing-masing.",
  },
  {
    id: "news-jumat-bersih-juli-2026",
    publishedDate: "2026-07-12",
    date: "12",
    month: "JUL",
    tag: "Agenda",
    title: "Jumat Bersih di Lingkungan Desa",
    text: "Warga diajak bergotong royong membersihkan lingkungan masing-masing.",
    extra: "Kegiatan dimulai pukul 07.00 WIB dari titik kumpul setiap RW. Peralatan kebersihan dibawa secara mandiri.",
  },
  {
    id: "news-pendataan-umkm-juli-2026",
    publishedDate: "2026-07-05",
    date: "05",
    month: "JUL",
    tag: "Informasi",
    title: "Pendataan Pelaku UMKM Desa",
    text: "Pendaftaran direktori UMKM dan jasa lokal dibuka tanpa dipungut biaya.",
    extra: "Siapkan nama usaha atau layanan, lokasi, jam layanan, nomor WhatsApp, dan foto produk jika mendaftarkan UMKM.",
  },
];

function waLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits;
  return `https://wa.me/${international}?text=${encodeURIComponent(message)}`;
}

function displayHours(value: string) {
  return value.replace(/[–—]/g, "-");
}

function formatVillageNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function villageProfileImageUrl(key: string | null | undefined) {
  return key
    ? `/api/media/${encodeURIComponent(key)}`
    : "/images/kepala-desa-cipeundeuy.jpg";
}

function trackWhatsAppClick(id: string) {
  void fetch("/api/directory/click", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
    keepalive: true,
  }).catch(() => {
    // WhatsApp tetap dibuka walaupun pencatatan analitik sedang tidak tersedia.
  });
}

function ActionArrow() {
  return (
    <span className="arrow-glyph" aria-hidden="true">
      ↘
    </span>
  );
}

function toNewsItem(
  item: NonNullable<ContentPayload["news"]>[number],
): NewsItem {
  const date = new Date(`${item.publishedDate}T00:00:00`);
  return {
    id: item.id,
    publishedDate: item.publishedDate,
    date: String(date.getDate()).padStart(2, "0"),
    month: new Intl.DateTimeFormat("id-ID", { month: "short" })
      .format(date)
      .replace(".", "")
      .toUpperCase(),
    tag: item.tag,
    title: item.title,
    text: item.summary,
    extra: item.body,
  };
}

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [businessFilter, setBusinessFilter] = useState("Semua");
  const [serviceQuery, setServiceQuery] = useState("");
  const [businessEntries, setBusinessEntries] =
    useState<Business[]>(businesses);
  const [serviceEntries, setServiceEntries] =
    useState<LocalService[]>(services);
  const [businessCategories, setBusinessCategories] = useState<string[]>(
    Array.from(new Set(businesses.map((item) => item.category))),
  );
  const [businessPageInfo, setBusinessPageInfo] =
    useState<DirectoryPageInfo>({
      offset: 0,
      limit: BUSINESS_PAGE_SIZE,
      total: businesses.length,
      hasMore: false,
    });
  const [servicePageInfo, setServicePageInfo] =
    useState<DirectoryPageInfo>({
      offset: 0,
      limit: SERVICE_PAGE_SIZE,
      total: services.length,
      hasMore: false,
    });
  const [businessLoading, setBusinessLoading] = useState(false);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [businessLoadingMore, setBusinessLoadingMore] = useState(false);
  const [serviceLoadingMore, setServiceLoadingMore] = useState(false);
  const [debouncedServiceQuery, setDebouncedServiceQuery] = useState("");
  const [directoryState, setDirectoryState] = useState<
    "loading" | "live" | "fallback"
  >("loading");
  const [directoryReady, setDirectoryReady] = useState(false);
  const [newsEntries, setNewsEntries] = useState<NewsItem[]>(info);
  const [villageProfileData, setVillageProfileData] =
    useState<VillageProfileData>(defaultVillageProfile);
  const [villageStatistics, setVillageStatistics] =
    useState<VillageStatistics>(defaultVillageStatistics);
  const [selectedBusiness, setSelectedBusiness] = useState<string | null>(null);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [activeInfo, setActiveInfo] = useState<number | null>(null);
  const [directoryFormOpen, setDirectoryFormOpen] = useState(false);
  const [submissionKind, setSubmissionKind] = useState<"umkm" | "service">(
    "umkm",
  );
  const [submissionServiceCategory, setSubmissionServiceCategory] = useState<string>(
    SERVICE_CATEGORIES[0],
  );
  const [submissionServiceIconKey, setSubmissionServiceIconKey] = useState<
    ServiceIconKey | ""
  >("");
  const [preparedDirectoryImage, setPreparedDirectoryImage] =
    useState<PreparedDirectoryImage | null>(null);
  const [directoryImageState, setDirectoryImageState] = useState<
    "idle" | "processing" | "ready" | "error"
  >("idle");
  const [directoryImageMessage, setDirectoryImageMessage] = useState("");
  const [submissionState, setSubmissionState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const productTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const directoryImageInputRef = useRef<HTMLInputElement | null>(null);
  const directoryImagePreviewUrlRef = useRef<string | null>(null);
  const directoryImageTaskRef = useRef(0);
  const directoryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const directoryInitializedRef = useRef(false);
  const businessFilterRef = useRef(businessFilter);
  const serviceQueryRef = useRef(serviceQuery);
  const businessCountRef = useRef(businessEntries.length);
  const serviceCountRef = useRef(serviceEntries.length);
  const previousBusinessFilterRef = useRef(businessFilter);
  const previousServiceQueryRef = useRef(debouncedServiceQuery);

  const clearPreparedDirectoryImage = () => {
    directoryImageTaskRef.current += 1;
    if (directoryImagePreviewUrlRef.current) {
      URL.revokeObjectURL(directoryImagePreviewUrlRef.current);
      directoryImagePreviewUrlRef.current = null;
    }
    if (directoryImageInputRef.current) {
      directoryImageInputRef.current.value = "";
    }
    setPreparedDirectoryImage(null);
    setDirectoryImageState("idle");
    setDirectoryImageMessage("");
  };

  const handleDirectoryImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const taskId = directoryImageTaskRef.current + 1;
    directoryImageTaskRef.current = taskId;

    if (directoryImagePreviewUrlRef.current) {
      URL.revokeObjectURL(directoryImagePreviewUrlRef.current);
      directoryImagePreviewUrlRef.current = null;
    }
    setPreparedDirectoryImage(null);

    if (!file) {
      setDirectoryImageState("idle");
      setDirectoryImageMessage("");
      return;
    }

    if (file.size > DIRECTORY_IMAGE_MAX_BYTES) {
      input.value = "";
      setDirectoryImageState("error");
      setDirectoryImageMessage("Ukuran foto melebihi 10 MB. Pilih foto yang lebih kecil.");
      return;
    }

    if (
      !DIRECTORY_IMAGE_TYPES.has(file.type) &&
      !directoryImageExtensionSupported(file)
    ) {
      input.value = "";
      setDirectoryImageState("error");
      setDirectoryImageMessage("Format foto harus JPG, PNG, atau WebP.");
      return;
    }

    setDirectoryImageState("processing");
    setDirectoryImageMessage("Menyiapkan dan memperkecil foto…");

    try {
      const prepared = await prepareDirectoryImage(file);
      if (directoryImageTaskRef.current !== taskId) return;

      const previewUrl = URL.createObjectURL(prepared.file);
      directoryImagePreviewUrlRef.current = previewUrl;
      setPreparedDirectoryImage({
        ...prepared,
        originalName: file.name,
        originalBytes: file.size,
        compressedBytes: prepared.file.size,
        previewUrl,
      });
      setDirectoryImageState("ready");
      setDirectoryImageMessage(
        `${formatDirectoryFileSize(file.size)} menjadi ${formatDirectoryFileSize(
          prepared.file.size,
        )}. Foto siap dikirim.`,
      );
    } catch (error) {
      if (directoryImageTaskRef.current !== taskId) return;
      input.value = "";
      setDirectoryImageState("error");
      setDirectoryImageMessage(
        error instanceof Error
          ? error.message
          : "Foto belum dapat diproses. Pilih foto lain.",
      );
    }
  };

  useEffect(() => {
    return () => {
      directoryImageTaskRef.current += 1;
      if (directoryImagePreviewUrlRef.current) {
        URL.revokeObjectURL(directoryImagePreviewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    type TrackedTouch = {
      element: HTMLElement;
      x: number;
      y: number;
    };

    const pointers = new Map<number, TrackedTouch>();
    const timers = new Map<HTMLElement, number>();

    const findAction = (target: EventTarget | null) =>
      target instanceof Element
        ? target.closest<HTMLElement>(".arrow-action")
        : null;

    const setArrowState = (
      element: HTMLElement,
      state: "engaged" | "activated" | null,
    ) => {
      const previousTimer = timers.get(element);
      if (previousTimer !== undefined) {
        window.clearTimeout(previousTimer);
        timers.delete(element);
      }

      if (state) element.dataset.arrowTouch = state;
      else delete element.dataset.arrowTouch;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        event.pointerType === "mouse" ||
        !event.isPrimary ||
        event.button !== 0
      ) {
        return;
      }

      const element = findAction(event.target);
      if (
        !element ||
        element.matches(":disabled,[aria-disabled='true']")
      ) {
        return;
      }

      pointers.set(event.pointerId, {
        element,
        x: event.clientX,
        y: event.clientY,
      });
      setArrowState(element, "engaged");
    };

    const onPointerUp = (event: PointerEvent) => {
      const tracked = pointers.get(event.pointerId);
      if (!tracked) return;
      pointers.delete(event.pointerId);

      const moved = Math.hypot(
        event.clientX - tracked.x,
        event.clientY - tracked.y,
      );

      if (moved > 12) {
        setArrowState(tracked.element, null);
        return;
      }

      setArrowState(tracked.element, "activated");
      const timer = window.setTimeout(() => {
        delete tracked.element.dataset.arrowTouch;
        timers.delete(tracked.element);
      }, 260);
      timers.set(tracked.element, timer);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const tracked = pointers.get(event.pointerId);
      if (!tracked) return;
      pointers.delete(event.pointerId);
      setArrowState(tracked.element, null);
    };

    document.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointerup", onPointerUp, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointercancel", onPointerCancel, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      timers.forEach((timer) => window.clearTimeout(timer));
      pointers.forEach(({ element }) => delete element.dataset.arrowTouch);
    };
  }, []);

  useEffect(() => {
    businessFilterRef.current = businessFilter;
    serviceQueryRef.current = serviceQuery;
    businessCountRef.current = businessEntries.length;
    serviceCountRef.current = serviceEntries.length;
  }, [
    businessEntries.length,
    businessFilter,
    serviceEntries.length,
    serviceQuery,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedServiceQuery(serviceQuery.trim()),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [serviceQuery]);

  useEffect(() => {
    const closeOverlay = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedBusiness(null);
        setDirectoryFormOpen(false);
        window.requestAnimationFrame(() => returnFocusRef.current?.focus());
      }
    };

    const modalOpen =
      selectedBusiness !== null ||
      directoryFormOpen;

    const keepFocusInDialog = (event: KeyboardEvent) => {
      if (!modalOpen || event.key !== "Tab") return;

      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"]',
      );
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    if (modalOpen) document.body.style.overflow = "hidden";

    window.addEventListener("keydown", closeOverlay);
    window.addEventListener("keydown", keepFocusInDialog);
    return () => {
      window.removeEventListener("keydown", closeOverlay);
      window.removeEventListener("keydown", keepFocusInDialog);
      document.body.style.overflow = previousOverflow;
    };
  }, [directoryFormOpen, selectedBusiness]);

  useEffect(() => {
    let mounted = true;

    const loadDirectory = async () => {
      try {
        const response = await fetch(
          `/api/directory?businessLimit=${BUSINESS_PAGE_SIZE}&serviceLimit=${SERVICE_PAGE_SIZE}`,
          {
            cache: "no-store",
            headers: { accept: "application/json" },
          },
        );
        const payload = (await response.json()) as DirectoryPayload;
        if (!response.ok) throw new Error(payload.error || "Direktori gagal dimuat.");
        if (!mounted) return;

        const nextBusinesses = payload.businesses || [];
        const nextServices = payload.services || [];
        if (
          businessFilterRef.current === "Semua" &&
          businessCountRef.current <= BUSINESS_PAGE_SIZE
        ) {
          setBusinessEntries(nextBusinesses);
          if (payload.pagination?.businesses) {
            setBusinessPageInfo(payload.pagination.businesses);
          }
        }
        if (
          !serviceQueryRef.current.trim() &&
          serviceCountRef.current <= SERVICE_PAGE_SIZE
        ) {
          setServiceEntries(nextServices);
          if (payload.pagination?.services) {
            setServicePageInfo(payload.pagination.services);
          }
        }
        if (payload.categories) setBusinessCategories(payload.categories);
        directoryInitializedRef.current = true;
        setDirectoryReady(true);
        setDirectoryState("live");
      } catch {
        if (mounted) {
          directoryInitializedRef.current = true;
          setDirectoryReady(true);
          setDirectoryState("fallback");
        }
      }
    };

    void loadDirectory();
    const refreshTimer = window.setInterval(() => void loadDirectory(), 60_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadDirectory();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!directoryReady || !directoryInitializedRef.current) return;
    if (previousBusinessFilterRef.current === businessFilter) return;
    previousBusinessFilterRef.current = businessFilter;

    const controller = new AbortController();
    const loadFilteredBusinesses = async () => {
      setBusinessLoading(true);
      setSelectedBusiness(null);
      try {
        const params = new URLSearchParams({
          kind: "umkm",
          limit: String(BUSINESS_PAGE_SIZE),
        });
        if (businessFilter !== "Semua") {
          params.set("category", businessFilter);
        }
        const response = await fetch(`/api/directory?${params}`, {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as DirectoryPayload;
        if (!response.ok) {
          throw new Error(payload.error || "UMKM gagal dimuat.");
        }
        setBusinessEntries(payload.businesses || []);
        if (payload.pagination?.businesses) {
          setBusinessPageInfo(payload.pagination.businesses);
        }
        if (payload.categories) setBusinessCategories(payload.categories);
        setDirectoryState("live");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDirectoryState("fallback");
        }
      } finally {
        if (!controller.signal.aborted) setBusinessLoading(false);
      }
    };

    void loadFilteredBusinesses();
    return () => controller.abort();
  }, [businessFilter, directoryReady]);

  useEffect(() => {
    if (!directoryReady || !directoryInitializedRef.current) return;
    if (previousServiceQueryRef.current === debouncedServiceQuery) return;
    previousServiceQueryRef.current = debouncedServiceQuery;

    const controller = new AbortController();
    const searchServices = async () => {
      setServiceLoading(true);
      setActiveService(null);
      try {
        const params = new URLSearchParams({
          kind: "service",
          limit: String(SERVICE_PAGE_SIZE),
        });
        if (debouncedServiceQuery) params.set("q", debouncedServiceQuery);
        const response = await fetch(`/api/directory?${params}`, {
          cache: "no-store",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const payload = (await response.json()) as DirectoryPayload;
        if (!response.ok) {
          throw new Error(payload.error || "Layanan gagal dimuat.");
        }
        setServiceEntries(payload.services || []);
        if (payload.pagination?.services) {
          setServicePageInfo(payload.pagination.services);
        }
        setDirectoryState("live");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setDirectoryState("fallback");
        }
      } finally {
        if (!controller.signal.aborted) setServiceLoading(false);
      }
    };

    void searchServices();
    return () => controller.abort();
  }, [debouncedServiceQuery, directoryReady]);

  useEffect(() => {
    let mounted = true;

    const loadVillageContent = async () => {
      try {
        const response = await fetch("/api/content", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const payload = (await response.json()) as ContentPayload;
        if (!response.ok) throw new Error(payload.error || "Konten gagal dimuat.");
        if (!mounted) return;

        if (payload.profile) {
          setVillageProfileData({
            ...defaultVillageProfile,
            ...payload.profile,
          });
        }
        if (payload.statistics) setVillageStatistics(payload.statistics);
        setNewsEntries((payload.news || []).map(toNewsItem));
        setActiveInfo(null);
      } catch {
        // Pertahankan konten terakhir agar portal tetap berguna saat koneksi terputus.
      }
    };

    void loadVillageContent();
    const refreshTimer = window.setInterval(
      () => void loadVillageContent(),
      60_000,
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadVillageContent();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  const closeDialog = () => {
    setSelectedBusiness(null);
    setDirectoryFormOpen(false);
    clearPreparedDirectoryImage();
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  const openProduct = (id: string) => {
    returnFocusRef.current = productTriggerRefs.current[id];
    setSelectedBusiness(id);
  };

  const openDirectoryForm = () => {
    returnFocusRef.current = directoryTriggerRef.current;
    clearPreparedDirectoryImage();
    setSubmissionKind("umkm");
    setSubmissionServiceCategory(SERVICE_CATEGORIES[0]);
    setSubmissionServiceIconKey("");
    setSubmissionState("idle");
    setSubmissionMessage("");
    setDirectoryFormOpen(true);
  };

  const submitDirectoryEntry = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    if (submissionKind === "umkm" && !preparedDirectoryImage) {
      setSubmissionState("error");
      setSubmissionMessage("Pilih satu foto produk sebelum mengirim pendaftaran.");
      directoryImageInputRef.current?.focus();
      return;
    }

    if (directoryImageState === "processing") {
      setSubmissionState("error");
      setSubmissionMessage("Tunggu sampai foto selesai diproses.");
      return;
    }

    setSubmissionState("submitting");
    setSubmissionMessage(
      submissionKind === "umkm"
        ? "Mengirim data dan foto produk…"
        : "Mengirim data layanan…",
    );

    data.set("kind", submissionKind);
    data.delete("image");
    if (submissionKind === "umkm" && preparedDirectoryImage) {
      data.set(
        "image",
        preparedDirectoryImage.file,
        preparedDirectoryImage.file.name,
      );
    }

    try {
      const response = await fetch("/api/directory", {
        method: "POST",
        body: data,
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(
          result?.error ||
            `Pendaftaran gagal dikirim oleh server (HTTP ${response.status}).`,
        );
      }

      form.reset();
      clearPreparedDirectoryImage();
      setSubmissionKind("umkm");
      setSubmissionServiceCategory(SERVICE_CATEGORIES[0]);
      setSubmissionServiceIconKey("");
      setSubmissionState("success");
      setSubmissionMessage(
        "Data sudah masuk dan menunggu pemeriksaan pengelola portal.",
      );
    } catch (error) {
      setSubmissionState("error");
      setSubmissionMessage(
        error instanceof Error ? error.message : "Pendaftaran gagal dikirim.",
      );
    }
  };

  const loadMoreBusinesses = async () => {
    if (!businessPageInfo.hasMore || businessLoadingMore) return;
    setBusinessLoadingMore(true);
    try {
      const params = new URLSearchParams({
        kind: "umkm",
        offset: String(businessPageInfo.offset + businessPageInfo.limit),
        limit: String(BUSINESS_PAGE_SIZE),
      });
      if (businessFilter !== "Semua") {
        params.set("category", businessFilter);
      }
      const response = await fetch(`/api/directory?${params}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as DirectoryPayload;
      if (!response.ok) throw new Error(payload.error || "UMKM gagal dimuat.");
      setBusinessEntries((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...(payload.businesses || []).filter(
            (item) => !knownIds.has(item.id),
          ),
        ];
      });
      if (payload.pagination?.businesses) {
        setBusinessPageInfo(payload.pagination.businesses);
      }
      setDirectoryState("live");
    } catch {
      setDirectoryState("fallback");
    } finally {
      setBusinessLoadingMore(false);
    }
  };

  const loadMoreServices = async () => {
    if (!servicePageInfo.hasMore || serviceLoadingMore) return;
    setServiceLoadingMore(true);
    try {
      const params = new URLSearchParams({
        kind: "service",
        offset: String(servicePageInfo.offset + servicePageInfo.limit),
        limit: String(SERVICE_PAGE_SIZE),
      });
      if (debouncedServiceQuery) params.set("q", debouncedServiceQuery);
      const response = await fetch(`/api/directory?${params}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as DirectoryPayload;
      if (!response.ok) {
        throw new Error(payload.error || "Layanan gagal dimuat.");
      }
      setServiceEntries((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...(payload.services || []).filter(
            (item) => !knownIds.has(item.id),
          ),
        ];
      });
      if (payload.pagination?.services) {
        setServicePageInfo(payload.pagination.services);
      }
      setDirectoryState("live");
    } catch {
      setDirectoryState("fallback");
    } finally {
      setServiceLoadingMore(false);
    }
  };

  const filteredBusinesses = businessEntries;
  const businessFilters = ["Semua", ...businessCategories];
  const filteredServices = serviceEntries;
  const selectedProduct =
    selectedBusiness === null
      ? null
      : businessEntries.find((item) => item.id === selectedBusiness) || null;
  const officePhone =
    villageProfileData.officePhone?.trim() || defaultVillageContact.officePhone;
  const officeEmail =
    villageProfileData.officeEmail?.trim() || defaultVillageContact.officeEmail;
  const serviceHoursMonThu =
    villageProfileData.serviceHoursMonThu?.trim() ||
    defaultVillageContact.serviceHoursMonThu;
  const serviceHoursFriday =
    villageProfileData.serviceHoursFriday?.trim() ||
    defaultVillageContact.serviceHoursFriday;
  const officeWhatsAppHref = waLink(
    officePhone,
    "Halo, saya ingin menghubungi Kantor Desa Cipeundeuy.",
  );

  return (
    <main className="portal-page">
      <div className="topbar">
        <div className="shell topbar-inner">
          <span>Portal Informasi Desa Cipeundeuy</span>
          <div>
            <span className="topbar-location">
              <i className="fa-solid fa-location-arrow" aria-hidden="true" />
              Kecamatan Cipeundeuy, Kabupaten Bandung Barat
            </span>
            <span>
              Senin - Kamis, {displayHours(serviceHoursMonThu.replace(" WIB", ""))} · Jumat,{" "}
              {displayHours(serviceHoursFriday.replace(" WIB", ""))}
            </span>
          </div>
        </div>
      </div>

      <header className="header">
        <div className="shell nav-wrap">
          <a className="brand" href="#beranda" aria-label="Portal Desa Cipeundeuy">
            <img
              className="brand-mark"
              src="/logo-kabupaten-bandung-barat.png"
              alt="Lambang Kabupaten Bandung Barat"
            />
            <span>
              <strong>CIPEUNDEUY</strong>
              <small>PORTAL DESA</small>
            </span>
          </a>
          <button
            className="menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
          >
            <span />
            <span />
          </button>
          <nav className={menuOpen ? "nav open" : "nav"} aria-label="Navigasi utama">
            {nav.map(([label, id]) => (
              <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <section className="hero" id="beranda">
        <div className="hero-shade" />
        <div className="shell hero-content">
          <span className="eyebrow light">SELAMAT DATANG DI</span>
          <h1>
            DESA
            <br />
            <em>CIPEUNDEUY</em>
          </h1>
          <p>
            Dari Desa, Tumbuh Bersama.
          </p>
          <div className="hero-actions">
            <a className="button primary arrow-action" href="#umkm">
              Jelajahi UMKM
              <span className="button-arrow arrow-control">
                <ActionArrow />
              </span>
            </a>
            <a className="button ghost" href="#profil">
              Lihat Profil Desa
            </a>
          </div>
        </div>
        <nav
          className="hero-shortcuts"
          aria-label="Jelajah Portal Desa Cipeundeuy"
        >
          <div className="hero-shortcuts-grid">
            <a
              className="value-pill soft"
              href="#sambutan"
              aria-label="Baca sambutan dan kenali Desa Cipeundeuy"
            >
              Mengenal
            </a>
            <a
              className="value-pill photo-one"
              href="#umkm"
              aria-label="Jelajahi produk UMKM Cipeundeuy"
            >
              UMKM
            </a>
            <a
              className="value-pill arrow-pill arrow-control arrow-action"
              href="#layanan"
              aria-label="Buka layanan dan jasa warga Cipeundeuy"
            >
              <ActionArrow />
            </a>
            <a
              className="value-pill photo-two"
              href="#informasi"
              aria-label="Baca kabar, pengumuman, dan kegiatan Desa Cipeundeuy"
            >
              Warga
            </a>
          </div>
        </nav>
      </section>

      <section
        className="section welcome"
        id="profil"
        aria-labelledby="profile-title"
      >
        <section
          className="shell village-stats"
          aria-labelledby="village-stats-title"
        >
          <h2 className="sr-only" id="village-stats-title">
            Statistik Desa Cipeundeuy
          </h2>
          <dl className="village-stats-grid">
            {[
              [
                formatVillageNumber(villageStatistics.populationCount),
                "Penduduk",
              ],
              [
                formatVillageNumber(villageStatistics.householdCount),
                "Kepala Keluarga",
              ],
              [formatVillageNumber(villageStatistics.rwCount), "Rukun Warga"],
              [
                formatVillageNumber(
                  villageStatistics.registeredUmkmCount ??
                    businessEntries.length,
                ),
                "UMKM Terdaftar",
              ],
            ].map(([number, label]) => (
              <div className="village-stat-item" key={label}>
                <dt>{label}</dt>
                <dd>{number}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="shell intro-heading">
          <span className="eyebrow">MENGENAL CIPEUNDEUY</span>
          <h2 id="profile-title">
            Mengenal Desa
            <br />{" "}
            <em>Cipeundeuy.</em>
          </h2>
          <p>
            Lihat profil desa, data penduduk, potensi setempat, UMKM, dan
            layanan warga.
          </p>
        </div>

        <div className="shell two-column" id="sambutan">
          <div className="photo-stack">
            <img
              className="main-photo"
              src={villageProfileImageUrl(villageProfileData.profileImageKey)}
              alt="Dokumentasi Desa Cipeundeuy"
              loading="lazy"
              decoding="async"
            />
            <div className="mini-card">
              <strong>“Sauyunan”</strong>
              <span>Bersama membangun desa</span>
            </div>
          </div>
          <div className="welcome-copy">
            <span className="eyebrow">SAMBUTAN KEPALA DESA</span>
            <h2>
              Sambutan dari Kepala Desa
              <br />
              Cipeundeuy.
            </h2>
            <p className="lead">{villageProfileData.greetingLead}</p>
            <p>{villageProfileData.welcomeParagraph}</p>
            <p>{villageProfileData.closingParagraph}</p>
            <div className="signature">
              <span>{villageProfileData.headName}</span>
              <small>{villageProfileData.headTitle}</small>
            </div>
            <a className="text-link arrow-action" href="#kontak">
              Kontak Pemerintah Desa
              <span className="small-link-arrow arrow-control">
                <ActionArrow />
              </span>
            </a>
          </div>
        </div>

        <section
          className="shell profile-potential"
          id="potensi"
          aria-labelledby="profile-potential-title"
        >
          <div className="profile-potential-head">
            <span className="eyebrow">USAHA WARGA</span>
            <h3 id="profile-potential-title">Yang tumbuh dari Cipeundeuy.</h3>
            <p>
              Hasil tani, kerajinan eceng gondok, dan olahan rumahan menjadi
              bagian dari penghidupan warga.
            </p>
          </div>
          <div className="profile-potential-actions">
            {potentials.map((item) => (
              <a
                className="profile-potential-card arrow-action"
                href="#umkm"
                aria-label={`${item.action}: ${item.title}`}
                onClick={() => setBusinessFilter(item.filter)}
                key={item.title}
              >
                <span className="profile-potential-copy">
                  <small>{item.label}</small>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </span>
                <span className="profile-potential-cta">
                  {item.action}
                  <span className="small-link-arrow arrow-control">
                    <ActionArrow />
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      </section>

      <section className="section umkm-section" id="umkm">
        <div className="shell">
          <div className="section-head umkm-head">
            <div>
              <span className="eyebrow">PRODUK WARGA</span>
              <h2>Belanja produk Cipeundeuy.</h2>
            </div>
            <p>
              Temukan kerajinan dan makanan buatan warga. Pilih produk untuk 
              melihat harga dan informasi lengkap, lalu pesan langsung melalui WhatsApp.
            </p>
          </div>
          <div className="umkm-toolbar">
            <div className="filters" role="group" aria-label="Filter UMKM">
              {businessFilters.map((filter) => (
                <button
                  className={businessFilter === filter ? "active" : ""}
                  aria-pressed={businessFilter === filter}
                  onClick={() => setBusinessFilter(filter)}
                  key={filter}
                >
                  {filter}
                </button>
              ))}
            </div>
            <p className="umkm-ranking-note">
              Produk yang sering dibuka melalui WhatsApp tampil lebih awal.
            </p>
          </div>
          <div
            className={`product-grid ${businessLoading ? "is-loading" : ""}`}
            aria-busy={businessLoading}
          >
            {filteredBusinesses.map((item) => {
              return (
                <article
                  className="product-card arrow-action"
                  key={item.id}
                  onClick={() => openProduct(item.id)}
                >
                  <div className="product-image">
                    <img
                      src={item.image}
                      alt={item.product}
                      loading="lazy"
                      decoding="async"
                      style={{ objectPosition: item.position }}
                    />
                    {item.featured && <span className="badge">Sering dibuka</span>}
                    <button
                      ref={(element) => {
                        productTriggerRefs.current[item.id] = element;
                      }}
                      type="button"
                      className="card-arrow product-arrow arrow-control"
                      aria-haspopup="dialog"
                      aria-label={`Lihat detail ${item.product}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openProduct(item.id);
                      }}
                    >
                      <ActionArrow />
                    </button>
                    <div className="image-reveal">
                      <span>Lihat produk</span>
                    </div>
                  </div>
                  <div className="product-body">
                    <span className="category">{item.category}</span>
                    <h3>{item.product}</h3>
                    <p>{item.name}</p>
                    <div className="product-bottom">
                      <strong>{item.price}</strong>
                      <a
                        className="arrow-action"
                        href={waLink(
                          item.phone,
                          `Halo, saya ingin bertanya tentang ${item.product} dari ${item.name}.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => {
                          event.stopPropagation();
                          trackWhatsAppClick(item.id);
                        }}
                        aria-label={`Tanya ${item.product} via WhatsApp`}
                      >
                        Tanya
                        <span className="inline-arrow arrow-control">
                          <ActionArrow />
                        </span>
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
            {!businessLoading && filteredBusinesses.length === 0 && (
              <p className="empty directory-empty">
                Belum ada UMKM pada kategori ini.
              </p>
            )}
          </div>
          <div className="directory-pagination">
            <span role="status" aria-live="polite">
              {businessLoading
                ? "Memuat UMKM…"
                : `Menampilkan ${businessEntries.length} dari ${businessPageInfo.total} UMKM`}
            </span>
            {businessPageInfo.hasMore && (
              <button
                type="button"
                className="load-more arrow-action"
                onClick={() => void loadMoreBusinesses()}
                disabled={businessLoadingMore}
              >
                {businessLoadingMore ? "Memuat…" : "Muat lebih banyak"}
                <span className="inline-arrow arrow-control">
                  <ActionArrow />
                </span>
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="section services" id="layanan">
        <div className="shell">
          <div className="section-head service-head">
            <div>
              <span className="eyebrow light">LAYANAN &amp; JASA WARGA</span>
              <h2>Cari layanan di Cipeundeuy.</h2>
              <p className="service-ranking-note">
                Lihat keterangan dan jam layanan, lalu hubungi penyedianya
                melalui WhatsApp.
              </p>
            </div>
            <label className="service-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Cari ojek, bengkel, jahit..."
                aria-label="Cari layanan lokal"
              />
            </label>
          </div>
          <div
            className={`service-list ${serviceLoading ? "is-loading" : ""}`}
            aria-busy={serviceLoading}
          >
            {filteredServices.map((item) => {
              const isActive = activeService === item.id;
              return (
                <article
                  className={`service-card arrow-action ${isActive ? "active" : ""}`}
                  key={item.id}
                  onClick={() => setActiveService(isActive ? null : item.id)}
                >
                  <div className="service-icon">
                    <ServiceCategoryIcon service={item} />
                  </div>
                  <div className="service-main">
                    <span>{item.type}</span>
                    {item.featured && (
                      <span className="service-featured">Sering dibuka</span>
                    )}
                    <h3>{item.name}</h3>
                    <p>{item.detail}</p>
                    <div className="service-extra">{item.extra}</div>
                  </div>
                  <div className="service-meta">
                    <small>Jam layanan</small>
                    <strong>{item.hours}</strong>
                  </div>
                  {isActive && (
                    <a
                      className="whatsapp arrow-action"
                      href={waLink(
                        item.phone,
                        `Halo, saya ingin bertanya tentang layanan ${item.name}.`,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => {
                        event.stopPropagation();
                        trackWhatsAppClick(item.id);
                      }}
                    >
                      Hubungi via WhatsApp
                      <span className="inline-arrow arrow-control">
                        <ActionArrow />
                      </span>
                    </a>
                  )}
                  <button
                    type="button"
                    className="service-arrow arrow-control"
                    aria-expanded={isActive}
                    aria-label={`${isActive ? "Tutup" : "Buka"} detail ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveService(isActive ? null : item.id);
                    }}
                  >
                    <ActionArrow />
                  </button>
                </article>
              );
            })}
            {!serviceLoading && filteredServices.length === 0 && (
              <p className="empty">Layanan tidak ditemukan. Coba kata kunci lain.</p>
            )}
          </div>
          <div className="directory-pagination service-pagination">
            <span role="status" aria-live="polite">
              {serviceLoading
                ? "Mencari layanan…"
                : `Menampilkan ${serviceEntries.length} dari ${servicePageInfo.total} layanan`}
            </span>
            {servicePageInfo.hasMore && (
              <button
                type="button"
                className="load-more arrow-action"
                onClick={() => void loadMoreServices()}
                disabled={serviceLoadingMore}
              >
                {serviceLoadingMore ? "Memuat…" : "Muat lebih banyak"}
                <span className="inline-arrow arrow-control">
                  <ActionArrow />
                </span>
              </button>
            )}
          </div>
          <div className="directory-callout">
            <div>
              <span className={`directory-live ${directoryState}`}>
                <i aria-hidden="true" />
                {directoryState === "live"
                  ? "Daftar layanan diperbarui"
                  : directoryState === "loading"
                    ? "Memuat daftar layanan"
                    : "Menampilkan daftar yang tersedia"}
              </span>
              <h3>Daftarkan UMKM atau layanan Anda</h3>
              <p>
                Isi formulir tanpa membuat akun. Pengelola portal akan memeriksa
                data sebelum ditampilkan.
              </p>
            </div>
            <div className="directory-callout-actions">
              <button
                ref={directoryTriggerRef}
                type="button"
                className="directory-register arrow-action"
                onClick={openDirectoryForm}
              >
                Buka formulir pendaftaran
                <span className="directory-arrow arrow-control">
                  <ActionArrow />
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="section information-section" id="informasi">
        <div className="shell">
          <div className="section-head split">
            <div>
              <span className="eyebrow">KABAR DESA</span>
              <h2>Pengumuman dan kegiatan desa.</h2>
            </div>
            <p>Pilih informasi untuk membaca keterangan lengkap.</p>
          </div>
          <div className="news-list">
            {newsEntries.map((item, index) => {
              const isActive = activeInfo === index;
              return (
                <article
                  className={`news-card arrow-action ${isActive ? "active" : ""}`}
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isActive}
                  onClick={() => setActiveInfo(isActive ? null : index)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActiveInfo(isActive ? null : index);
                    }
                  }}
                >
                  <div className="date">
                    <strong>{item.date}</strong>
                    <span>{item.month}</span>
                  </div>
                  <div className="news-copy">
                    <span className="category">{item.tag}</span>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    <div className="news-more">{item.extra}</div>
                  </div>
                  <span className="news-arrow arrow-control" aria-hidden="true">
                    <ActionArrow />
                  </span>
                </article>
              );
            })}
            {newsEntries.length === 0 && (
              <p className="news-empty">
                Belum ada informasi yang sedang ditayangkan.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="contact-section" id="kontak">
        <div className="shell">
          <span className="eyebrow">KONTAK DESA</span>
          <h2>Kontak dan lokasi kantor desa.</h2>
          <div className="contact-grid">
            <div className="contact-card coral-card">
              <span className="contact-kicker">Kantor Desa Cipeundeuy</span>
              <h3>Hubungi Kantor Desa Cipeundeuy.</h3>
              <p>{villageLocation.address}</p>
              <p className="contact-details">
                <a
                  href={officeWhatsAppHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  {officePhone}
                </a>
                <a href={`mailto:${officeEmail}`}>{officeEmail}</a>
              </p>
              <a
                className="contact-button arrow-action"
                href={officeWhatsAppHref}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp kantor desa
                <span className="contact-arrow arrow-control">
                  <ActionArrow />
                </span>
              </a>
            </div>
            <div className="contact-card schedule-card">
              <div>
                <span className="contact-kicker">Jam pelayanan</span>
                <h3>Jadwal pelayanan Kantor Desa Cipeundeuy.</h3>
              </div>
              <div className="schedule-row">
                <span>Senin - Kamis</span>
                <strong>{displayHours(serviceHoursMonThu)}</strong>
              </div>
              <div className="schedule-row">
                <span>Jumat</span>
                <strong>{displayHours(serviceHoursFriday)}</strong>
              </div>
              <a href="#layanan" className="schedule-link arrow-action">
                Lihat layanan warga
                <span className="small-link-arrow arrow-control">
                  <ActionArrow />
                </span>
              </a>
            </div>
            <div className="location-card">
              <div className="location-panel">
                <span className="location-label">Lokasi kantor desa</span>
                <h3>Kantor Desa Cipeundeuy.</h3>
                <p>{villageLocation.address}</p>
                <a
                  className="location-link arrow-action"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    villageLocation.query,
                  )}&destination_place_id=${villageLocation.placeId}&dir_action=navigate`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Buka petunjuk arah
                  <span className="location-arrow arrow-control">
                    <ActionArrow />
                  </span>
                </a>
              </div>
              <iframe
                className="location-map"
                src={`https://www.google.com/maps?ll=${encodeURIComponent(
                  villageLocation.mapCenter,
                )}&z=${villageLocation.zoom}&t=m&output=embed&hl=id`}
                title="Peta kawasan Desa Cipeundeuy"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="shell footer-grid">
          <div className="footer-brand">
            <div className="brand">
              <img
                className="brand-mark"
                src="/logo-kabupaten-bandung-barat.png"
                alt="Lambang Kabupaten Bandung Barat"
              />
              <span>
                <strong>CIPEUNDEUY</strong>
                <small>PORTAL DESA</small>
              </span>
            </div>
            <p>
              Profil, kabar, UMKM, dan layanan Desa Cipeundeuy.
            </p>
          </div>
          <div>
            <h3>Jelajahi</h3>
            <a href="#profil">Profil Desa</a>
            <a href="#umkm">UMKM Lokal</a>
            <a href="#layanan">Layanan & Jasa</a>
            <a href="#informasi">Informasi Desa</a>
          </div>
          <div>
            <h3>Kontak Desa</h3>
            <p>{villageLocation.address}</p>
            <p>
              <a
                href={officeWhatsAppHref}
                target="_blank"
                rel="noreferrer"
              >
                {officePhone}
              </a>
              <br />
              <a href={`mailto:${officeEmail}`}>{officeEmail}</a>
            </p>
          </div>
          <div>
            <h3>Jam Pelayanan</h3>
            <p>
              Senin - Kamis
              <br />
              <strong>{displayHours(serviceHoursMonThu)}</strong>
            </p>
            <p>
              Jumat
              <br />
              <strong>{displayHours(serviceHoursFriday)}</strong>
            </p>
          </div>
        </div>
        <div className="shell footer-bottom">
          <span>© 2026 Pemerintah Desa Cipeundeuy</span>
          <span>
            Pengelolaan situs:{" "}
            <a className="footer-manager-link" href="/kelola">
              Masuk Pengelola
            </a>
          </span>
        </div>
      </footer>

      {directoryFormOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            className="directory-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="directory-modal-title"
          >
            <button
              autoFocus
              type="button"
              className="modal-close"
              onClick={closeDialog}
              aria-label="Tutup formulir pendaftaran"
            >
              ×
            </button>

            {submissionState === "success" ? (
              <div className="submission-success">
                <span aria-hidden="true">✓</span>
                <p className="category">PENDAFTARAN TERSIMPAN</p>
                <h2 id="directory-modal-title">Terima kasih.</h2>
                <p>{submissionMessage}</p>
                <div className="submission-success-actions">
                  <button type="button" onClick={closeDialog}>
                    Selesai
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionState("idle");
                      setSubmissionMessage("");
                    }}
                  >
                    Daftarkan data lain
                  </button>
                </div>
              </div>
            ) : (
              <form className="directory-form" onSubmit={submitDirectoryEntry}>
                <header className="directory-form-head">
                  <span className="category">PENDAFTARAN UMKM &amp; LAYANAN</span>
                  <h2 id="directory-modal-title">
                    Daftarkan usaha atau layanan
                  </h2>
                  <p>
                    Formulir ini tidak memerlukan akun. Data baru akan tayang
                    setelah diperiksa pengelola portal.
                  </p>
                  <ul className="directory-form-points" aria-label="Proses pendaftaran">
                    <li>
                      <i className="fa-solid fa-user-check" aria-hidden="true" />
                      <span><strong>Tanpa akun</strong><small>Langsung isi dan kirim.</small></span>
                    </li>
                    <li>
                      <i className="fa-solid fa-clipboard-check" aria-hidden="true" />
                      <span><strong>Ditinjau pengelola</strong><small>Diperiksa sebelum tayang.</small></span>
                    </li>
                    <li>
                      <i className="fa-solid fa-shield-heart" aria-hidden="true" />
                      <span>
                        <strong>Atas izin pemilik</strong>
                        <small>
                          {submissionKind === "umkm"
                            ? "Foto, kontak, dan lokasi ditampilkan sesuai izin."
                            : "Kontak dan lokasi ditampilkan sesuai izin."}
                        </small>
                      </span>
                    </li>
                  </ul>
                </header>

                <div className="directory-form-content">
                  <fieldset className="directory-form-section">
                    <legend className="sr-only">Informasi utama</legend>
                    <div className="directory-form-section-heading">
                      <span>01</span>
                      <h3>Informasi utama</h3>
                      <small>Isi nama dan kategori usaha atau layanan.</small>
                    </div>
                    <div className="directory-form-grid">
                      <label>
                        <span>Jenis pendaftaran</span>
                        <select
                          name="kind"
                          value={submissionKind}
                          onChange={(event) => {
                            const nextKind =
                              event.target.value === "service" ? "service" : "umkm";
                            setSubmissionKind(nextKind);
                            setSubmissionMessage("");
                            setSubmissionState("idle");
                            if (nextKind === "service") {
                              clearPreparedDirectoryImage();
                            }
                          }}
                          required
                        >
                          <option value="umkm">UMKM / Produk</option>
                          <option value="service">Layanan / Jasa</option>
                        </select>
                      </label>
                      <label>
                        <span>Nama usaha atau penyedia</span>
                        <input
                          name="name"
                          maxLength={100}
                          placeholder="Contoh: Dapur Ibu Euis"
                          autoComplete="organization"
                          required
                        />
                      </label>
                      {submissionKind === "umkm" ? (
                        <label>
                          <span>Kategori produk</span>
                          <input
                            name="category"
                            maxLength={60}
                            placeholder="Kuliner, kerajinan…"
                            required
                          />
                        </label>
                      ) : (
                        <label>
                          <span>Kategori layanan</span>
                          <select
                            name="category"
                            value={submissionServiceCategory}
                            onChange={(event) =>
                              setSubmissionServiceCategory(event.target.value)
                            }
                            required
                          >
                            {SERVICE_CATEGORIES.map((category) => (
                              <option value={category} key={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label>
                        <span>
                          {submissionKind === "umkm"
                            ? "Nama produk utama"
                            : "Ringkasan layanan"}
                        </span>
                        <input
                          name="title"
                          maxLength={120}
                          placeholder={
                            submissionKind === "umkm"
                              ? "Tas eceng gondok"
                              : "Antar jemput dalam desa"
                          }
                          required
                        />
                      </label>
                    </div>
                  </fieldset>

                  <fieldset className="directory-form-section">
                    <legend className="sr-only">Detail dan kontak</legend>
                    <div className="directory-form-section-heading">
                      <span>02</span>
                      <h3>Detail dan kontak</h3>
                      <small>Isi harga atau jam layanan dan nomor WhatsApp.</small>
                    </div>
                    <div className="directory-form-grid">
                      <label>
                        <span>
                          {submissionKind === "umkm"
                            ? "Harga mulai (Rp)"
                            : "Jam layanan"}
                        </span>
                        <input
                          key={submissionKind}
                          name="meta"
                          type={submissionKind === "umkm" ? "number" : "text"}
                          inputMode={
                            submissionKind === "umkm" ? "numeric" : "text"
                          }
                          min={submissionKind === "umkm" ? 1 : undefined}
                          max={
                            submissionKind === "umkm"
                              ? 1_000_000_000_000
                              : undefined
                          }
                          step={submissionKind === "umkm" ? 1 : undefined}
                          maxLength={submissionKind === "service" ? 80 : undefined}
                          placeholder={
                            submissionKind === "umkm"
                              ? "Contoh: 25000"
                              : "06.00–21.00"
                          }
                          aria-describedby={
                            submissionKind === "umkm"
                              ? "directory-price-help"
                              : undefined
                          }
                          required
                        />
                      </label>
                      <label>
                        <span>Nomor WhatsApp</span>
                        <input
                          name="phone"
                          type="tel"
                          inputMode="tel"
                          maxLength={24}
                          placeholder="08xxxxxxxxxx"
                          autoComplete="tel"
                          required
                        />
                      </label>
                      <label className="wide">
                        <span>Deskripsi</span>
                        <textarea
                          name="description"
                          minLength={20}
                          maxLength={700}
                          rows={4}
                          placeholder="Jelaskan produk atau layanan, wilayah jangkauan, dan informasi penting lainnya."
                          required
                        />
                      </label>
                    </div>
                    {submissionKind === "umkm" && (
                      <p className="directory-section-note" id="directory-price-help">
                        <i className="fa-solid fa-circle-info" aria-hidden="true" />
                        Masukkan angka saja; portal akan menampilkannya sebagai
                        “Mulai Rp25.000”.
                      </p>
                    )}
                  </fieldset>

                  <fieldset className="directory-form-section optional">
                    <legend className="sr-only">Informasi publik</legend>
                    <div className="directory-form-section-heading">
                      <span>03</span>
                      <h3>
                        {submissionKind === "umkm"
                          ? "Lokasi dan foto produk"
                          : "Wilayah layanan"}
                      </h3>
                      <small>
                        {submissionKind === "umkm"
                          ? "Tambahkan satu foto utama yang jelas."
                          : "Lokasi dapat dikosongkan jika layanan tidak memiliki tempat tetap."}
                      </small>
                    </div>
                    <div className="directory-form-grid">
                      <label>
                        <span>Lokasi publik (opsional)</span>
                        <input
                          name="publicLocation"
                          maxLength={160}
                          placeholder="Cukup dusun/RW, tanpa alamat rumah rinci"
                          autoComplete="address-level3"
                        />
                      </label>
                      {submissionKind === "umkm" ? (
                        <div
                          className="directory-image-field wide"
                          aria-busy={directoryImageState === "processing"}
                        >
                          <label htmlFor="directory-product-image">
                            <span>Foto produk utama</span>
                            <small>JPG, PNG, atau WebP. Maksimal 10 MB.</small>
                          </label>
                          <input
                            ref={directoryImageInputRef}
                            id="directory-product-image"
                            name="image"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            aria-describedby="directory-image-help directory-image-status"
                            aria-invalid={directoryImageState === "error"}
                            onChange={(event) => void handleDirectoryImageChange(event)}
                            disabled={
                              directoryImageState === "processing" ||
                              submissionState === "submitting"
                            }
                            required
                          />
                          <p id="directory-image-help" className="directory-image-help">
                            Foto diperkecil otomatis agar lebih ringan saat dibuka.
                          </p>
                          {preparedDirectoryImage && (
                            <div className="directory-image-preview">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={preparedDirectoryImage.previewUrl}
                                alt="Pratinjau foto produk yang akan dikirim"
                              />
                              <div>
                                <strong>{preparedDirectoryImage.originalName}</strong>
                                <span>
                                  {formatDirectoryFileSize(
                                    preparedDirectoryImage.originalBytes,
                                  )}{" "}
                                  →{" "}
                                  {formatDirectoryFileSize(
                                    preparedDirectoryImage.compressedBytes,
                                  )}
                                </span>
                                <small>
                                  WebP {preparedDirectoryImage.width} ×{" "}
                                  {preparedDirectoryImage.height} piksel
                                </small>
                                <button
                                  type="button"
                                  onClick={clearPreparedDirectoryImage}
                                  disabled={submissionState === "submitting"}
                                >
                                  Hapus foto
                                </button>
                              </div>
                            </div>
                          )}
                          <p
                            id="directory-image-status"
                            className={`directory-image-status ${directoryImageState}`}
                            role={directoryImageState === "error" ? "alert" : "status"}
                            aria-live="polite"
                          >
                            {directoryImageMessage}
                          </p>
                        </div>
                      ) : (
                        <div className="directory-service-icon-note wide">
                          <span aria-hidden="true">
                            <ServiceCategoryIcon
                              service={{
                                type: submissionServiceCategory,
                                iconKey: submissionServiceIconKey || null,
                              }}
                            />
                          </span>
                          <label>
                            <strong>Ikon layanan (opsional)</strong>
                            <select
                              name="iconKey"
                              value={submissionServiceIconKey}
                              onChange={(event) =>
                                setSubmissionServiceIconKey(
                                  event.target.value as ServiceIconKey | "",
                                )
                              }
                            >
                              <option value="">Otomatis sesuai kategori</option>
                              {SERVICE_ICON_CATALOG.map((icon) => (
                                <option value={icon.key} key={icon.key}>
                                  {icon.label}
                                </option>
                              ))}
                            </select>
                            <small>
                              Pilih ikon yang sesuai atau biarkan otomatis.
                              Pengelola dapat menyesuaikannya sebelum tayang.
                            </small>
                          </label>
                        </div>
                      )}
                    </div>
                  </fieldset>

                  <label className="form-honeypot" aria-hidden="true">
                    <span>Website</span>
                    <input
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </label>

                  <div className="directory-form-footer">
                    <label className="directory-consent">
                      <input
                        type="checkbox"
                        name="consent"
                        value="accepted"
                        required
                      />
                      <span>
                        {submissionKind === "umkm"
                          ? "Saya memiliki izin untuk mengirim dan menampilkan foto produk, informasi usaha, dan nomor kontak tersebut."
                          : "Saya memiliki izin untuk mengirim dan menampilkan informasi layanan dan nomor kontak tersebut."}
                      </span>
                    </label>

                    {submissionMessage && (
                      <p
                        className={`submission-message ${submissionState}`}
                        role="status"
                      >
                        {submissionMessage}
                      </p>
                    )}

                    <button
                      type="submit"
                      className="directory-submit arrow-action"
                      disabled={
                        submissionState === "submitting" ||
                        (submissionKind === "umkm" &&
                          directoryImageState === "processing")
                      }
                    >
                      {directoryImageState === "processing"
                        ? "Menyiapkan foto…"
                        : submissionState === "submitting"
                          ? "Menyimpan…"
                          : "Kirim untuk diperiksa"}
                      <span className="directory-arrow arrow-control">
                        <ActionArrow />
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {selectedProduct && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
          >
            <button
              autoFocus
              className="modal-close"
              onClick={closeDialog}
              aria-label="Tutup detail produk"
            >
              ×
            </button>
            <div className="modal-image">
              <img
                src={selectedProduct.image}
                alt={selectedProduct.product}
                style={{ objectPosition: selectedProduct.position }}
              />
            </div>
            <div className="modal-copy">
              <span className="category">{selectedProduct.category}</span>
              <h2 id="product-modal-title">{selectedProduct.product}</h2>
              <p className="modal-owner">{selectedProduct.name}</p>
              <p>{selectedProduct.description}</p>
              <strong>{selectedProduct.price}</strong>
              <a
                className="modal-whatsapp arrow-action"
                href={waLink(
                  selectedProduct.phone,
                  `Halo, saya ingin bertanya tentang ${selectedProduct.product} dari ${selectedProduct.name}.`,
                )}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackWhatsAppClick(selectedProduct.id)}
              >
                Tanya via WhatsApp
                <span className="modal-action-arrow arrow-control">
                  <ActionArrow />
                </span>
              </a>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
