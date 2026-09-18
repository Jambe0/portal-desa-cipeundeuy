import { and, count, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  directoryEntries,
  newsEntries,
  villageProfile,
} from "@/db/schema";

export const dynamic = "force-dynamic";

function jakartaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${readPart("year")}-${readPart("month")}-${readPart("day")}`;
}

export async function GET() {
  try {
    const db = getDb();
    const today = jakartaDateKey();
    const [profileRows, news, umkmCountRows] = await Promise.all([
      db.select().from(villageProfile).where(eq(villageProfile.id, "main")).limit(1),
      db
        .select()
        .from(newsEntries)
        .where(
          and(
            eq(newsEntries.status, "published"),
            lte(newsEntries.publishedDate, today),
            or(isNull(newsEntries.expiresAt), gte(newsEntries.expiresAt, today)),
          ),
        )
        .orderBy(desc(newsEntries.publishedDate), desc(newsEntries.updatedAt))
        .limit(12),
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
    const profile = profileRows[0] || null;

    return Response.json(
      {
        profile,
        statistics: {
          populationCount: profile?.populationCount ?? 8742,
          householdCount: profile?.householdCount ?? 2685,
          rwCount: profile?.rwCount ?? 12,
          registeredUmkmCount: Number(umkmCountRows[0]?.total || 0),
        },
        news,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("public content GET failed", error);
    return Response.json(
      { error: "Kabar dan profil desa belum dapat dimuat. Coba lagi beberapa saat." },
      { status: 503 },
    );
  }
}
