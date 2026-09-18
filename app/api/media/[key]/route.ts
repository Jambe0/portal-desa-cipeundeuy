import { and, eq } from "drizzle-orm";
import { requestAdmin } from "@/app/admin-auth";
import {
  getMediaBucket,
  validDirectoryMediaKey,
  validVillageProfileMediaKey,
} from "@/app/media-storage";
import { getDb } from "@/db";
import { directoryEntries, villageProfile } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  let imageMime: string | null = null;
  let isPublic = false;

  if (validDirectoryMediaKey(key)) {
    const [entry] = await getDb()
      .select({ status: directoryEntries.status, imageMime: directoryEntries.imageMime })
      .from(directoryEntries)
      .where(
        and(
          eq(directoryEntries.imageKey, key),
          eq(directoryEntries.kind, "umkm"),
        ),
      )
      .limit(1);

    if (!entry) return new Response("Not found", { status: 404 });
    const admin = await requestAdmin(request);
    if (entry.status !== "published" && !admin) {
      return new Response("Not found", { status: 404 });
    }
    imageMime = entry.imageMime;
    isPublic = entry.status === "published";
  } else if (validVillageProfileMediaKey(key)) {
    const [profile] = await getDb()
      .select({ imageMime: villageProfile.profileImageMime })
      .from(villageProfile)
      .where(eq(villageProfile.profileImageKey, key))
      .limit(1);

    if (!profile) return new Response("Not found", { status: 404 });
    imageMime = profile.imageMime;
    isPublic = true;
  } else {
    return new Response("Not found", { status: 404 });
  }

  const media = await getMediaBucket().get(key);
  if (!media) return new Response("Not found", { status: 404 });

  return new Response(media.body, {
    headers: {
      "content-type": imageMime || media.httpMetadata?.contentType || "application/octet-stream",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cross-origin-resource-policy": "same-origin",
      "cache-control": isPublic ? "public, max-age=3600, immutable" : "private, no-store",
    },
  });
}
