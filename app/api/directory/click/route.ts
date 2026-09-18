import { and, count, eq } from "drizzle-orm";
import {
  analyticsHash,
  analyticsVisitor,
  jakartaDay,
  requestNetwork,
} from "@/app/directory-analytics";
import { isSameOriginRequest } from "@/app/auth/security";
import {
  consumeRateLimit,
  rateLimitResponse,
} from "@/app/request-rate-limit";
import { readLimitedJsonObject } from "@/app/request-security";
import { getDb } from "@/db";
import { directoryClickEvents, directoryEntries } from "@/db/schema";
import { getAppUrl } from "@/app/server-config";

export const dynamic = "force-dynamic";

const MAX_NETWORK_EVENTS_PER_DAY = 30;

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    if (!isSameOriginRequest(request, getAppUrl().origin)) {
      return Response.json(
        { error: "Permintaan lintas situs tidak diizinkan." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    const bodyResult = await readLimitedJsonObject(request, 2 * 1024);
    if (!bodyResult.ok) return bodyResult.response;
    const payload = bodyResult.value;
    const id = cleanText(payload.id, 80);
    if (!id) {
      return Response.json(
        { error: "ID direktori diperlukan." },
        { status: 400 },
      );
    }

    const visitor = analyticsVisitor(request);
    const network = requestNetwork(request);
    const actorHash = await analyticsHash(
      "click-rate",
      network ? `network|${network}` : `visitor|${visitor.visitorId}`,
    );
    const globalAllowed = await consumeRateLimit({
      bucketKey: "directory-click:global",
      limit: 180,
      windowSeconds: 60,
    });
    if (!globalAllowed) {
      return rateLimitResponse(
        "Terlalu banyak interaksi. Tunggu sebentar lalu coba kembali.",
        60,
      );
    }
    const actorAllowed = await consumeRateLimit({
      bucketKey: `directory-click:actor:${actorHash}`,
      limit: 30,
      windowSeconds: 60,
    });
    if (!actorAllowed) {
      return rateLimitResponse(
        "Terlalu banyak interaksi. Tunggu sebentar lalu coba kembali.",
        60,
      );
    }

    const db = getDb();
    const [entry] = await db
      .select({ id: directoryEntries.id })
      .from(directoryEntries)
      .where(
        and(
          eq(directoryEntries.id, id),
          eq(directoryEntries.status, "published"),
        ),
      )
      .limit(1);

    if (!entry) {
      return Response.json(
        { error: "Produk atau layanan tidak ditemukan." },
        { status: 404 },
      );
    }

    const now = new Date();
    const dayBucket = jakartaDay(now);
    const visitorHash = await analyticsHash("visitor", visitor.visitorId);
    const networkHash = await analyticsHash(
      "network",
      network
        ? `${dayBucket}|${network}`
        : `${dayBucket}|visitor|${visitor.visitorId}`,
    );
    const [networkUsage] = network
      ? await db
          .select({ total: count() })
          .from(directoryClickEvents)
          .where(
            and(
              eq(directoryClickEvents.dayBucket, dayBucket),
              eq(directoryClickEvents.networkHash, networkHash),
            ),
          )
      : [{ total: 0 }];

    let counted = false;
    if ((networkUsage?.total || 0) < MAX_NETWORK_EVENTS_PER_DAY) {
      const inserted = await db
        .insert(directoryClickEvents)
        .values({
          id: crypto.randomUUID(),
          directoryEntryId: id,
          dayBucket,
          visitorHash,
          networkHash,
          clickedAt: now,
        })
        .onConflictDoNothing({
          target: [
            directoryClickEvents.directoryEntryId,
            directoryClickEvents.dayBucket,
            directoryClickEvents.visitorHash,
          ],
        })
        .returning({ id: directoryClickEvents.id });

      counted = inserted.length > 0;
    }

    const headers = new Headers({ "cache-control": "no-store" });
    if (visitor.setCookie) headers.append("set-cookie", visitor.setCookie);

    return Response.json({ counted }, { headers });
  } catch (error) {
    console.error("directory click POST failed", error);
    return Response.json(
      { error: "Interaksi belum dapat dicatat." },
      { status: 503 },
    );
  }
}
