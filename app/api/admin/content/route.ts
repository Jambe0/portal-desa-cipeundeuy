import { and, count, desc, eq } from "drizzle-orm";
import {
  requestAdminEmail,
  requestAdminMutation,
} from "@/app/admin-auth";
import { readLimitedJsonObject } from "@/app/request-security";
import { getDb } from "@/db";
import {
  directoryEntries,
  newsEntries,
  villageProfile,
} from "@/db/schema";

export const dynamic = "force-dynamic";

type NewsStatus = "draft" | "published" | "archived";

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validDate(value: string, optional = false) {
  if (!value) return optional;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function validInteger(value: unknown, maximum: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maximum
    ? parsed
    : null;
}

function validOfficePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return (
    digits.length >= 8 &&
    digits.length <= 15 &&
    /^[+\d][\d\s().-]*$/.test(value)
  );
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function newsPayload(payload: Record<string, unknown>) {
  const tag = cleanText(payload.tag, 40);
  const title = cleanText(payload.title, 140);
  const summary = cleanText(payload.summary, 240);
  const body = cleanText(payload.body, 1200);
  const publishedDate = cleanText(payload.publishedDate, 10);
  const expiresAt = cleanText(payload.expiresAt, 10);
  const status: NewsStatus | null =
    payload.status === "draft" ||
    payload.status === "published" ||
    payload.status === "archived"
      ? payload.status
      : null;

  if (
    !tag ||
    !title ||
    !summary ||
    body.length < 20 ||
    !validDate(publishedDate) ||
    !validDate(expiresAt, true) ||
    (expiresAt && expiresAt < publishedDate) ||
    !status
  ) {
    return null;
  }

  return {
    tag,
    title,
    summary,
    body,
    publishedDate,
    expiresAt: expiresAt || null,
    status,
  };
}

function unauthorized() {
  return Response.json(
    { error: "Sesi pengelola tidak valid atau telah berakhir." },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const adminEmail = await requestAdminEmail(request);
  if (!adminEmail) return unauthorized();

  try {
    const db = getDb();
    const [news, profileRows, umkmCountRows] = await Promise.all([
      db
        .select()
        .from(newsEntries)
        .orderBy(desc(newsEntries.publishedDate), desc(newsEntries.updatedAt)),
      db.select().from(villageProfile).where(eq(villageProfile.id, "main")).limit(1),
      db
        .select({ total: count() })
        .from(directoryEntries)
        .where(
          and(
            eq(directoryEntries.kind, "umkm"),
            eq(directoryEntries.status, "published"),
          ),
        ),
    ]);

    return Response.json(
      {
        news,
        profile: profileRows[0] || null,
        registeredUmkmCount: Number(umkmCountRows[0]?.total || 0),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("admin content GET failed", error);
    return Response.json(
      { error: "Kabar dan profil desa gagal dimuat." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await requestAdminMutation(request);
  if (!admin) return unauthorized();

  try {
    const bodyResult = await readLimitedJsonObject(request, 16 * 1024);
    if (!bodyResult.ok) return bodyResult.response;
    const payload = bodyResult.value;
    const parsed = newsPayload(payload);
    if (!parsed) {
      return Response.json(
        { error: "Periksa judul, ringkasan, isi, tanggal, dan status Kabar Desa." },
        { status: 400 },
      );
    }

    const now = new Date();
    const [entry] = await getDb()
      .insert(newsEntries)
      .values({
        id: crypto.randomUUID(),
        ...parsed,
        authorEmail: admin.email,
        createdAt: now,
        updatedAt: now,
        publishedAt: parsed.status === "published" ? now : null,
      })
      .returning();

    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("admin content POST failed", error);
    return Response.json(
      { error: "Kabar Desa gagal disimpan." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requestAdminMutation(request);
  if (!admin) return unauthorized();

  try {
    const bodyResult = await readLimitedJsonObject(request, 16 * 1024);
    if (!bodyResult.ok) return bodyResult.response;
    const payload = bodyResult.value;
    const resource = cleanText(payload.resource, 20);
    const now = new Date();

    if (resource === "profile") {
      const headName = cleanText(payload.headName, 100);
      const headTitle = cleanText(payload.headTitle, 100);
      const greetingLead = cleanText(payload.greetingLead, 220);
      const welcomeParagraph = cleanText(payload.welcomeParagraph, 1000);
      const closingParagraph = cleanText(payload.closingParagraph, 1000);
      const officePhone = cleanText(payload.officePhone, 40);
      const officeEmail = cleanText(payload.officeEmail, 160).toLowerCase();
      const serviceHoursMonThu = cleanText(payload.serviceHoursMonThu, 80);
      const serviceHoursFriday = cleanText(payload.serviceHoursFriday, 80);
      const populationCount = validInteger(payload.populationCount, 100_000_000);
      const householdCount = validInteger(payload.householdCount, 100_000_000);
      const rwCount = validInteger(payload.rwCount, 10_000);

      if (
        !headName ||
        !headTitle ||
        !greetingLead ||
        welcomeParagraph.length < 20 ||
        closingParagraph.length < 20 ||
        !validOfficePhone(officePhone) ||
        !validEmail(officeEmail) ||
        !serviceHoursMonThu ||
        !serviceHoursFriday ||
        populationCount === null ||
        householdCount === null ||
        rwCount === null ||
        householdCount > populationCount
      ) {
        return Response.json(
          {
            error:
              "Periksa nama, jabatan, sambutan, kontak, jadwal pelayanan, dan statistik desa.",
          },
          { status: 400 },
        );
      }

      const values = {
        headName,
        headTitle,
        greetingLead,
        welcomeParagraph,
        closingParagraph,
        officePhone,
        officeEmail,
        serviceHoursMonThu,
        serviceHoursFriday,
        populationCount,
        householdCount,
        rwCount,
        updatedAt: now,
        updatedBy: admin.email,
      };
      const [profile] = await getDb()
        .insert(villageProfile)
        .values({ id: "main", ...values })
        .onConflictDoUpdate({
          target: villageProfile.id,
          set: values,
        })
        .returning();

      return Response.json({ profile });
    }

    if (resource === "news") {
      const id = cleanText(payload.id, 80);
      const parsed = newsPayload(payload);
      if (!id || !parsed) {
        return Response.json(
          { error: "Periksa judul, ringkasan, isi, tanggal, dan status Kabar Desa." },
          { status: 400 },
        );
      }

      const [entry] = await getDb()
        .update(newsEntries)
        .set({
          ...parsed,
          authorEmail: admin.email,
          updatedAt: now,
          publishedAt: parsed.status === "published" ? now : null,
        })
        .where(eq(newsEntries.id, id))
        .returning();

      if (!entry) {
        return Response.json(
          { error: "Kabar Desa tidak ditemukan." },
          { status: 404 },
        );
      }

      return Response.json({ entry });
    }

    return Response.json(
      { error: "Jenis konten tidak dikenali." },
      { status: 400 },
    );
  } catch (error) {
    console.error("admin content PATCH failed", error);
    return Response.json(
      { error: "Perubahan belum tersimpan. Coba lagi." },
      { status: 500 },
    );
  }
}
