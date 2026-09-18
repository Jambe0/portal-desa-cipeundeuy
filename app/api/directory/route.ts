import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  ilike,
  max,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  requestAdminEmail,
  requestAdminMutation,
} from "@/app/admin-auth";
import {
  analyticsCutoffDay,
  analyticsHash,
  analyticsVisitor,
  requestNetwork,
} from "@/app/directory-analytics";
import {
  displayDirectoryMeta,
  normalizeDirectoryPrice,
} from "@/app/directory-price";
import {
  directoryMediaKey,
  getMediaBucket,
  MediaStorageError,
  MediaValidationError,
  validateDirectoryImage,
} from "@/app/media-storage";
import { isServiceIconKey } from "@/app/service-icons";
import { isSameOriginRequest } from "@/app/auth/security";
import {
  consumeRateLimit,
  rateLimitResponse,
} from "@/app/request-rate-limit";
import { readLimitedJsonObject } from "@/app/request-security";
import { getAppUrl } from "@/app/server-config";
import { classifyOperationalError } from "@/app/operational-errors";
import { getDb } from "@/db";
import {
  directoryClickEvents,
  directoryEntries,
  type DirectoryEntry,
} from "@/db/schema";

export const dynamic = "force-dynamic";

const DEFAULT_UMKM_IMAGE =
  "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1000&q=88";
const FEATURED_LIMIT = 3;
const FEATURED_MIN_VISITORS = 3;
const DEFAULT_BUSINESS_PAGE_SIZE = 8;
const DEFAULT_SERVICE_PAGE_SIZE = 4;
const MODERATION_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;

type DirectoryStatus = "pending" | "published" | "archived";
type DirectoryKind = DirectoryEntry["kind"];

function databaseError(error: unknown, fallbackMessage: string) {
  if (error instanceof MediaStorageError) {
    return Response.json(
      { error: error.message, code: "MEDIA_STORAGE_UNAVAILABLE" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const failure = classifyOperationalError(error);

  if (failure === "DB_SCHEMA_OUTDATED") {
    return Response.json(
      {
        code: failure,
        error:
          "Struktur basis data belum diperbarui. Pengelola perlu menjalankan npm run db:migrate lalu restart aplikasi.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (failure === "DB_CONNECTION_FAILED") {
    return Response.json(
      {
        code: failure,
        error:
          "Koneksi basis data belum tersedia. Pengelola perlu memeriksa pengaturan PostgreSQL.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (failure === "DB_PERMISSION_DENIED") {
    return Response.json(
      {
        code: failure,
        error:
          "User PostgreSQL belum memiliki izin yang diperlukan oleh portal.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (failure === "APP_CONFIG_INVALID") {
    return Response.json(
      {
        code: failure,
        error:
          "Konfigurasi aplikasi belum lengkap. Pengelola perlu memeriksa APP_URL, AUTH_SECRET, dan ANALYTICS_SALT pada file .env.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  if (failure === "MEDIA_STORAGE_UNAVAILABLE") {
    return Response.json(
      {
        code: failure,
        error:
          "Folder penyimpanan foto belum dapat ditulis. Pengelola perlu memeriksa MEDIA_UPLOAD_DIR.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(
    { error: fallbackMessage, code: failure },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizePhone(value: unknown) {
  const digits = cleanText(value, 24).replace(/\D/g, "");
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  return digits ? `62${digits}` : "";
}

function validHttpsUrl(value: string) {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function consentAccepted(value: unknown) {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "on", "yes", "setuju", "accepted"].includes(
    value.trim().toLowerCase(),
  );
}

type PublicSubmission = {
  payload: Record<string, unknown>;
  image: File | null;
};

type RejectedPublicSubmission = {
  response: Response;
};

async function parsePublicSubmission(
  request: Request,
): Promise<PublicSubmission | RejectedPublicSubmission | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return {
        response: Response.json(
          {
            error:
              "Formulir atau foto tidak dapat dibaca. Muat ulang halaman lalu pilih foto kembali.",
          },
          { status: 400, headers: { "cache-control": "no-store" } },
        ),
      };
    }
    const payload: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") payload[key] = value;
    }

    const imageValue = form.get("image") ?? form.get("photo");
    return {
      payload,
      image:
        imageValue instanceof File && imageValue.size > 0 ? imageValue : null,
    };
  }

  if (contentType.includes("application/json")) {
    const bodyResult = await readLimitedJsonObject(request, 16 * 1024);
    if (!bodyResult.ok) return { response: bodyResult.response };
    return {
      payload: bodyResult.value,
      image: null,
    };
  }

  return null;
}

type ClickScore = {
  uniqueVisitors30d: number;
  validClicks30d: number;
  lastValidClickAt: number;
};

const emptyClickScore: ClickScore = {
  uniqueVisitors30d: 0,
  validClicks30d: 0,
  lastValidClickAt: 0,
};

function timestamp(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value) || Number(value) || 0;
  return 0;
}

function boundedInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function directorySearch(query: string) {
  const pattern = `%${query}%`;
  return or(
    ilike(directoryEntries.name, pattern),
    ilike(directoryEntries.category, pattern),
    ilike(directoryEntries.title, pattern),
    ilike(directoryEntries.description, pattern),
  );
}

function publicConditions(
  kind: DirectoryKind,
  category: string,
  query: string,
) {
  const conditions: SQL[] = [
    eq(directoryEntries.status, "published"),
    eq(directoryEntries.kind, kind),
  ];

  if (kind === "umkm" && category) {
    conditions.push(eq(directoryEntries.category, category));
  }

  if (query) {
    const search = directorySearch(query);
    if (search) conditions.push(search);
  }

  return and(...conditions);
}

function moderationConditions(
  status: DirectoryStatus | "all",
  query: string,
) {
  const conditions: SQL[] = [];
  if (status !== "all") conditions.push(eq(directoryEntries.status, status));
  if (query) {
    const search = directorySearch(query);
    if (search) conditions.push(search);
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

async function loadClickScores(
  db: ReturnType<typeof getDb>,
  entryIds?: string[],
) {
  if (entryIds && entryIds.length === 0) {
    return new Map<string, ClickScore>();
  }

  const conditions: SQL[] = [
    gte(directoryClickEvents.dayBucket, analyticsCutoffDay()),
  ];
  if (entryIds) {
    conditions.push(inArray(directoryClickEvents.directoryEntryId, entryIds));
  }

  const scoreRows = await db
    .select({
      directoryEntryId: directoryClickEvents.directoryEntryId,
      uniqueVisitors30d: countDistinct(directoryClickEvents.visitorHash),
      validClicks30d: count(directoryClickEvents.id),
      lastValidClickAt: max(directoryClickEvents.clickedAt),
    })
    .from(directoryClickEvents)
    .where(and(...conditions))
    .groupBy(directoryClickEvents.directoryEntryId);

  return new Map<string, ClickScore>(
    scoreRows.map((score) => [
      score.directoryEntryId,
      {
        uniqueVisitors30d: Number(score.uniqueVisitors30d || 0),
        validClicks30d: Number(score.validClicks30d || 0),
        lastValidClickAt: timestamp(score.lastValidClickAt),
      },
    ]),
  );
}

async function loadRankedRows(
  db: ReturnType<typeof getDb>,
  kind: DirectoryKind,
  options: {
    category?: string;
    query?: string;
    offset: number;
    limit: number;
  },
) {
  const uniqueVisitors30d = countDistinct(
    directoryClickEvents.visitorHash,
  );
  const validClicks30d = count(directoryClickEvents.id);
  const lastValidClickAt = max(directoryClickEvents.clickedAt);

  return db
    .select({
      id: directoryEntries.id,
      kind: directoryEntries.kind,
      name: directoryEntries.name,
      category: directoryEntries.category,
      title: directoryEntries.title,
      description: directoryEntries.description,
      meta: directoryEntries.meta,
      phone: directoryEntries.phone,
      publicLocation: directoryEntries.publicLocation,
      imageUrl: directoryEntries.imageUrl,
      imageKey: directoryEntries.imageKey,
      imageMime: directoryEntries.imageMime,
      imageBytes: directoryEntries.imageBytes,
      imageWidth: directoryEntries.imageWidth,
      imageHeight: directoryEntries.imageHeight,
      iconKey: directoryEntries.iconKey,
      status: directoryEntries.status,
      featured: directoryEntries.featured,
      source: directoryEntries.source,
      reviewedBy: directoryEntries.reviewedBy,
      createdAt: directoryEntries.createdAt,
      updatedAt: directoryEntries.updatedAt,
      publishedAt: directoryEntries.publishedAt,
      uniqueVisitors30d,
      validClicks30d,
      lastValidClickAt,
    })
    .from(directoryEntries)
    .leftJoin(
      directoryClickEvents,
      and(
        eq(directoryClickEvents.directoryEntryId, directoryEntries.id),
        gte(directoryClickEvents.dayBucket, analyticsCutoffDay()),
      ),
    )
    .where(
      publicConditions(
        kind,
        cleanText(options.category, 60),
        cleanText(options.query, 80),
      ),
    )
    .groupBy(directoryEntries.id)
    .orderBy(
      desc(uniqueVisitors30d),
      desc(validClicks30d),
      sql`${lastValidClickAt} DESC NULLS LAST`,
      desc(directoryEntries.publishedAt),
      asc(directoryEntries.id),
    )
    .limit(options.limit + 1)
    .offset(options.offset);
}

async function loadRankedPage(
  db: ReturnType<typeof getDb>,
  kind: DirectoryKind,
  options: {
    category?: string;
    query?: string;
    offset: number;
    limit: number;
  },
) {
  const where = publicConditions(
    kind,
    cleanText(options.category, 60),
    cleanText(options.query, 80),
  );
  const [rows, totalRows] = await Promise.all([
    loadRankedRows(db, kind, options),
    db
      .select({ total: count() })
      .from(directoryEntries)
      .where(where),
  ]);
  const hasMore = rows.length > options.limit;

  return {
    rows: rows.slice(0, options.limit),
    pageInfo: {
      offset: options.offset,
      limit: options.limit,
      total: Number(totalRows[0]?.total || 0),
      hasMore,
    },
  };
}

async function loadFeaturedIds(
  db: ReturnType<typeof getDb>,
  kind: DirectoryKind,
) {
  const rows = await loadRankedRows(db, kind, {
    offset: 0,
    limit: FEATURED_LIMIT,
  });

  return new Set(
    rows
      .slice(0, FEATURED_LIMIT)
      .filter(
        (entry) =>
          Number(entry.uniqueVisitors30d || 0) >= FEATURED_MIN_VISITORS,
      )
      .map((entry) => entry.id),
  );
}

function toBusiness(
  entry: Awaited<ReturnType<typeof loadRankedRows>>[number],
  featuredIds: Set<string>,
) {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    product: entry.title,
    price: displayDirectoryMeta("umkm", entry.meta),
    description: entry.description,
    image: entry.imageKey
      ? `/api/media/${encodeURIComponent(entry.imageKey)}`
      : entry.imageUrl || DEFAULT_UMKM_IMAGE,
    position: "50% 50%",
    phone: entry.phone,
    featured: featuredIds.has(entry.id),
  };
}

function toService(
  entry: Awaited<ReturnType<typeof loadRankedRows>>[number],
  featuredIds: Set<string>,
) {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.category,
    detail: entry.title,
    hours: entry.meta,
    extra: entry.description,
    phone: entry.phone,
    iconKey: entry.iconKey,
    featured: featuredIds.has(entry.id),
  };
}

async function loadBusinessCategories(db: ReturnType<typeof getDb>) {
  return db
    .select({
      category: directoryEntries.category,
      total: count(),
    })
    .from(directoryEntries)
    .where(
      and(
        eq(directoryEntries.status, "published"),
        eq(directoryEntries.kind, "umkm"),
      ),
    )
    .groupBy(directoryEntries.category)
    .orderBy(asc(directoryEntries.category));
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const url = new URL(request.url);
    const moderation = url.searchParams.get("scope") === "moderation";

    if (moderation) {
      if (!(await requestAdminEmail(request))) {
        return Response.json(
          { error: "Sesi pengelola tidak valid atau telah berakhir." },
          { status: 401, headers: { "cache-control": "no-store" } },
        );
      }

      const statusParam = url.searchParams.get("status");
      const status: DirectoryStatus | "all" =
        statusParam === "pending" ||
        statusParam === "published" ||
        statusParam === "archived"
          ? statusParam
          : "all";
      const query = cleanText(url.searchParams.get("q"), 80);
      const offset = boundedInteger(
        url.searchParams.get("offset"),
        0,
        0,
        1_000_000,
      );
      const limit = boundedInteger(
        url.searchParams.get("limit"),
        MODERATION_PAGE_SIZE,
        1,
        MAX_PAGE_SIZE,
      );
      const where = moderationConditions(status, query);
      const countWhere = query ? directorySearch(query) : undefined;

      const [pageRows, totalRows, statusCountRows, businessFeatured, serviceFeatured] =
        await Promise.all([
          db
            .select()
            .from(directoryEntries)
            .where(where)
            .orderBy(
              desc(directoryEntries.createdAt),
              desc(directoryEntries.id),
            )
            .limit(limit + 1)
            .offset(offset),
          db
            .select({ total: count() })
            .from(directoryEntries)
            .where(where),
          db
            .select({
              status: directoryEntries.status,
              total: count(),
            })
            .from(directoryEntries)
            .where(countWhere)
            .groupBy(directoryEntries.status),
          loadFeaturedIds(db, "umkm"),
          loadFeaturedIds(db, "service"),
        ]);
      const hasMore = pageRows.length > limit;
      const rows = pageRows.slice(0, limit);
      const scores = await loadClickScores(
        db,
        rows.map((entry) => entry.id),
      );
      const entries = rows.map((entry) => {
        const score = scores.get(entry.id) || emptyClickScore;
        return {
          ...entry,
          imageUrl: entry.imageKey
            ? `/api/media/${encodeURIComponent(entry.imageKey)}`
            : entry.imageUrl,
          meta: displayDirectoryMeta(entry.kind, entry.meta),
          whatsappUniqueVisitors30d: score.uniqueVisitors30d,
          whatsappClicks30d: score.validClicks30d,
          autoFeatured:
            entry.kind === "umkm"
              ? businessFeatured.has(entry.id)
              : serviceFeatured.has(entry.id),
        };
      });
      const counts = {
        pending: 0,
        published: 0,
        archived: 0,
        all: 0,
      };
      for (const row of statusCountRows) {
        counts[row.status] = Number(row.total || 0);
        counts.all += Number(row.total || 0);
      }

      return Response.json(
        {
          entries,
          pagination: {
            offset,
            limit,
            total: Number(totalRows[0]?.total || 0),
            hasMore,
          },
          counts,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const kindParam = url.searchParams.get("kind");
    const requestedKind: DirectoryKind | null =
      kindParam === "umkm" || kindParam === "service" ? kindParam : null;
    const limit = boundedInteger(
      url.searchParams.get("limit"),
      requestedKind === "service"
        ? DEFAULT_SERVICE_PAGE_SIZE
        : DEFAULT_BUSINESS_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );
    const businessLimit = boundedInteger(
      url.searchParams.get("businessLimit"),
      DEFAULT_BUSINESS_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );
    const serviceLimit = boundedInteger(
      url.searchParams.get("serviceLimit"),
      DEFAULT_SERVICE_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );
    const offset = boundedInteger(
      url.searchParams.get("offset"),
      0,
      0,
      1_000_000,
    );
    const category =
      requestedKind === "umkm"
        ? cleanText(url.searchParams.get("category"), 60)
        : "";
    const query = cleanText(url.searchParams.get("q"), 80);
    const categoriesPromise = loadBusinessCategories(db);

    let businesses: ReturnType<typeof toBusiness>[] = [];
    let services: ReturnType<typeof toService>[] = [];
    let businessPage:
      | Awaited<ReturnType<typeof loadRankedPage>>["pageInfo"]
      | undefined;
    let servicePage:
      | Awaited<ReturnType<typeof loadRankedPage>>["pageInfo"]
      | undefined;

    if (requestedKind === "umkm") {
      const [page, featuredIds] = await Promise.all([
        loadRankedPage(db, "umkm", { category, query, offset, limit }),
        loadFeaturedIds(db, "umkm"),
      ]);
      businesses = page.rows.map((entry) => toBusiness(entry, featuredIds));
      businessPage = page.pageInfo;
    } else if (requestedKind === "service") {
      const [page, featuredIds] = await Promise.all([
        loadRankedPage(db, "service", { query, offset, limit }),
        loadFeaturedIds(db, "service"),
      ]);
      services = page.rows.map((entry) => toService(entry, featuredIds));
      servicePage = page.pageInfo;
    } else {
      const [
        nextBusinessPage,
        nextServicePage,
        businessFeatured,
        serviceFeatured,
      ] = await Promise.all([
        loadRankedPage(db, "umkm", {
          offset: 0,
          limit: businessLimit,
        }),
        loadRankedPage(db, "service", {
          offset: 0,
          limit: serviceLimit,
        }),
        loadFeaturedIds(db, "umkm"),
        loadFeaturedIds(db, "service"),
      ]);
      businesses = nextBusinessPage.rows.map((entry) =>
        toBusiness(entry, businessFeatured),
      );
      services = nextServicePage.rows.map((entry) =>
        toService(entry, serviceFeatured),
      );
      businessPage = nextBusinessPage.pageInfo;
      servicePage = nextServicePage.pageInfo;
    }
    const categoryRows = await categoriesPromise;

    const visitor = analyticsVisitor(request);
    const headers = new Headers({ "cache-control": "no-store" });
    if (visitor.setCookie) headers.append("set-cookie", visitor.setCookie);

    return Response.json(
      {
        businesses,
        services,
        categories: categoryRows.map((row) => row.category),
        pagination: {
          businesses: businessPage,
          services: servicePage,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("directory GET failed", error);
    return databaseError(
      error,
      "Data UMKM dan layanan belum dapat dimuat. Coba lagi beberapa saat.",
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request, getAppUrl().origin)) {
      return Response.json(
        { error: "Permintaan lintas situs tidak diizinkan." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    const parsed = await parsePublicSubmission(request);
    if (!parsed) {
      return Response.json(
        { error: "Format pengiriman tidak didukung. Muat ulang halaman lalu coba lagi." },
        { status: 415 },
      );
    }
    if ("response" in parsed) return parsed.response;

    const { payload, image } = parsed;
    const visitor = analyticsVisitor(request);
    const network = requestNetwork(request);
    const actorHash = await analyticsHash(
      "directory-submit-rate",
      network ? `network|${network}` : `visitor|${visitor.visitorId}`,
    );
    const globalAllowed = await consumeRateLimit({
      bucketKey: "directory-submit:global",
      limit: 60,
      windowSeconds: 60 * 60,
    });
    if (!globalAllowed) {
      return rateLimitResponse(
        "Pendaftaran sedang ramai. Coba kembali dalam satu jam.",
        60 * 60,
      );
    }
    const actorAllowed = await consumeRateLimit({
      bucketKey: `directory-submit:actor:${actorHash}`,
      limit: 10,
      windowSeconds: 60 * 60,
    });
    if (!actorAllowed) {
      return rateLimitResponse(
        "Batas pendaftaran tercapai. Coba kembali dalam satu jam.",
        60 * 60,
      );
    }

    const honeypot = cleanText(payload.website, 120);

    if (honeypot) {
      return Response.json(
        { error: "Permintaan tidak dapat diproses." },
        { status: 400 },
      );
    }

    if (!consentAccepted(payload.consent)) {
      return Response.json(
        {
          error: "Centang persetujuan setelah memastikan pemilik mengizinkan data ditampilkan.",
        },
        { status: 400 },
      );
    }

    const kind =
      payload.kind === "umkm" || payload.kind === "service"
        ? payload.kind
        : null;
    const name = cleanText(payload.name, 100);
    const category = cleanText(payload.category, 60);
    const title = cleanText(payload.title, 120);
    const description = cleanText(payload.description, 700);
    const rawMeta = cleanText(payload.meta, 80);
    const meta =
      kind === "umkm" ? normalizeDirectoryPrice(rawMeta) : rawMeta;
    const phone = normalizePhone(payload.phone);
    const publicLocation = cleanText(payload.publicLocation, 160);
    const imageUrl = kind === "umkm" ? cleanText(payload.imageUrl, 500) : "";
    const requestedIconKey = cleanText(payload.iconKey, 40);

    if (
      requestedIconKey &&
      (kind !== "service" || !isServiceIconKey(requestedIconKey))
    ) {
      return Response.json(
        { error: "Pilih ikon layanan yang tersedia pada formulir." },
        { status: 400 },
      );
    }

    if (kind === "service" && image) {
      return Response.json(
        { error: "Foto produk hanya tersedia untuk pendaftaran UMKM." },
        { status: 400 },
      );
    }

    if (kind === "umkm" && !meta) {
      return Response.json(
        { error: "Masukkan harga awal berupa angka, contoh 85000." },
        { status: 400 },
      );
    }

    if (
      !kind ||
      !name ||
      !category ||
      !title ||
      description.length < 20 ||
      !meta ||
      phone.length < 10 ||
      phone.length > 15
    ) {
      return Response.json(
        { error: "Lengkapi data wajib dan periksa kembali nomor WhatsApp." },
        { status: 400 },
      );
    }

    if (!validHttpsUrl(imageUrl)) {
      return Response.json(
        { error: "Tautan foto harus menggunakan alamat HTTPS." },
        { status: 400 },
      );
    }

    const db = getDb();
    const duplicate = await db
      .select({ id: directoryEntries.id })
      .from(directoryEntries)
      .where(
        and(
          eq(directoryEntries.kind, kind),
          eq(directoryEntries.name, name),
          eq(directoryEntries.phone, phone),
          ne(directoryEntries.status, "archived"),
        ),
      )
      .limit(1);

    if (duplicate.length > 0) {
      return Response.json(
        { error: "Usaha atau layanan ini sudah pernah didaftarkan." },
        { status: 409 },
      );
    }

    const id = crypto.randomUUID();
    const validatedImage = image ? await validateDirectoryImage(image) : null;
    const storedImageKey = validatedImage
      ? directoryMediaKey(id, validatedImage.mime)
      : null;
    const media = validatedImage ? getMediaBucket() : null;

    if (validatedImage && storedImageKey && media) {
      await media.put(storedImageKey, validatedImage.bytes, {
        httpMetadata: { contentType: validatedImage.mime },
        customMetadata: { directoryEntryId: id, moderationStatus: "pending" },
      });
    }

    let submission: { id: string; status: DirectoryStatus } | undefined;
    try {
      const now = new Date();
      [submission] = await db
        .insert(directoryEntries)
        .values({
          id,
          kind,
          name,
          category,
          title,
          description,
          meta,
          phone,
          publicLocation: publicLocation || null,
          imageUrl: storedImageKey ? null : imageUrl || null,
          imageKey: storedImageKey,
          imageMime: validatedImage?.mime || null,
          imageBytes: validatedImage?.byteLength || null,
          imageWidth: validatedImage?.width || null,
          imageHeight: validatedImage?.height || null,
          iconKey: kind === "service" ? requestedIconKey || null : null,
          status: "pending",
          featured: false,
          source: "portal-form",
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: directoryEntries.id,
          status: directoryEntries.status,
        });
    } catch (error) {
      if (storedImageKey && media) {
        await media.delete(storedImageKey).catch((cleanupError) => {
          console.error("directory image cleanup failed", cleanupError);
        });
      }
      throw error;
    }

    return Response.json({ submission }, { status: 201 });
  } catch (error) {
    console.error("directory POST failed", error);
    if (error instanceof MediaValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return databaseError(
      error,
      "Pendaftaran belum dapat dikirim. Coba lagi beberapa saat.",
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const reviewer = (await requestAdminMutation(request))?.email || null;
    if (!reviewer) {
      return Response.json(
        { error: "Sesi pengelola tidak valid atau telah berakhir." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

    const bodyResult = await readLimitedJsonObject(request, 4 * 1024);
    if (!bodyResult.ok) return bodyResult.response;
    const payload = bodyResult.value as {
      id?: unknown;
      status?: unknown;
      iconKey?: unknown;
    };
    const id = cleanText(payload.id, 80);
    const hasStatus = Object.prototype.hasOwnProperty.call(payload, "status");
    const hasIconKey = Object.prototype.hasOwnProperty.call(payload, "iconKey");
    const status: DirectoryStatus | null =
      payload.status === "published" || payload.status === "archived"
        ? payload.status
        : null;
    const requestedIconKey = cleanText(payload.iconKey, 40);
    const iconKey = requestedIconKey || null;

    if (!id || (!hasStatus && !hasIconKey)) {
      return Response.json(
        { error: "Data dan perubahan yang diminta belum lengkap." },
        { status: 400 },
      );
    }
    if (hasStatus && !status) {
      return Response.json(
        { error: "Status yang dipilih tidak valid." },
        { status: 400 },
      );
    }
    if (hasIconKey && iconKey && !isServiceIconKey(iconKey)) {
      return Response.json(
        { error: "Ikon layanan yang dipilih tidak tersedia." },
        { status: 400 },
      );
    }

    const db = getDb();
    if (hasIconKey) {
      const [target] = await db
        .select({ kind: directoryEntries.kind })
        .from(directoryEntries)
        .where(eq(directoryEntries.id, id))
        .limit(1);
      if (!target) {
        return Response.json(
          { error: "Data yang diminta tidak ditemukan." },
          { status: 404 },
        );
      }
      if (target.kind !== "service") {
        return Response.json(
          { error: "Ikon hanya dapat digunakan untuk layanan." },
          { status: 400 },
        );
      }
    }

    const now = new Date();
    const [entry] = await db
      .update(directoryEntries)
      .set({
        ...(status
          ? {
              status,
              publishedAt: status === "published" ? now : null,
            }
          : {}),
        ...(hasIconKey ? { iconKey } : {}),
        reviewedBy: reviewer,
        updatedAt: now,
      })
      .where(eq(directoryEntries.id, id))
      .returning();

    if (!entry) {
      return Response.json(
        { error: "Data yang diminta tidak ditemukan." },
        { status: 404 },
      );
    }

    return Response.json({
      entry: {
        ...entry,
        imageUrl: entry.imageKey
          ? `/api/media/${encodeURIComponent(entry.imageKey)}`
          : entry.imageUrl,
      },
    });
  } catch (error) {
    console.error("directory PATCH failed", error);
    return databaseError(
      error,
      "Status pendaftaran belum dapat diubah. Coba lagi.",
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const reviewer = (await requestAdminMutation(request))?.email || null;
    if (!reviewer) {
      return Response.json(
        { error: "Sesi pengelola tidak valid atau telah berakhir." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }

    const id = cleanText(new URL(request.url).searchParams.get("id"), 80);
    if (!id) {
      return Response.json(
        { error: "Pilih data yang akan dihapus." },
        { status: 400 },
      );
    }

    const db = getDb();
    const [existing] = await db
      .select({ status: directoryEntries.status, imageKey: directoryEntries.imageKey })
      .from(directoryEntries)
      .where(eq(directoryEntries.id, id))
      .limit(1);

    if (!existing) {
      return Response.json(
        { error: "Data yang diminta tidak ditemukan." },
        { status: 404 },
      );
    }

    if (existing.status !== "archived") {
      return Response.json(
        { error: "Arsipkan data terlebih dahulu sebelum menghapus permanen." },
        { status: 409 },
      );
    }

    const [deleted] = await db
      .delete(directoryEntries)
      .where(and(eq(directoryEntries.id, id), eq(directoryEntries.status, "archived")))
      .returning({ id: directoryEntries.id, imageKey: directoryEntries.imageKey });

    if (deleted) {
      if (deleted.imageKey) {
        await getMediaBucket()
          .delete(deleted.imageKey)
          .catch((cleanupError) => {
            console.error("permanent image cleanup failed", cleanupError);
          });
      }
      return Response.json(
        { deleted: { id: deleted.id } },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return Response.json({ error: "Data belum dapat dihapus. Coba lagi." }, { status: 409 });
  } catch (error) {
    console.error("directory DELETE failed", error);
    return databaseError(error, "Data belum dapat dihapus. Coba lagi.");
  }
}
