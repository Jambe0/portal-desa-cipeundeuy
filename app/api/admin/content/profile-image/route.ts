import { eq } from "drizzle-orm";
import { requestAdminMutation } from "@/app/admin-auth";
import {
  getMediaBucket,
  MAX_DIRECTORY_IMAGE_BYTES,
  MediaStorageError,
  MediaValidationError,
  validateDirectoryImage,
  villageProfileMediaKey,
} from "@/app/media-storage";
import { classifyOperationalError } from "@/app/operational-errors";
import { getDb } from "@/db";
import { villageProfile } from "@/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PROFILE_IMAGE_REQUEST_BYTES = MAX_DIRECTORY_IMAGE_BYTES + 256 * 1024;

function jsonError(status: number, error: string, code?: string) {
  return Response.json(
    { error, ...(code ? { code } : {}) },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function unauthorized() {
  return jsonError(401, "Sesi pengelola tidak valid atau telah berakhir.");
}

function uploadFailure(error: unknown) {
  if (error instanceof MediaValidationError) {
    return jsonError(400, error.message);
  }
  if (error instanceof MediaStorageError) {
    return jsonError(503, error.message, "MEDIA_STORAGE_UNAVAILABLE");
  }

  const failure = classifyOperationalError(error);
  if (failure === "DB_SCHEMA_OUTDATED") {
    return jsonError(
      503,
      "Struktur basis data belum diperbarui. Jalankan npm run db:migrate lalu restart aplikasi.",
      failure,
    );
  }
  if (failure === "DB_CONNECTION_FAILED" || failure === "DB_PERMISSION_DENIED") {
    return jsonError(
      503,
      "Basis data belum dapat diakses. Periksa pengaturan PostgreSQL lalu coba lagi.",
      failure,
    );
  }
  if (failure === "MEDIA_STORAGE_UNAVAILABLE") {
    return jsonError(
      503,
      "Folder penyimpanan foto belum dapat ditulis. Periksa MEDIA_UPLOAD_DIR.",
      failure,
    );
  }

  return jsonError(500, "Foto belum dapat disimpan. Coba lagi beberapa saat.", failure);
}

function validContentLength(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return null;
  const declaredBytes = Number(contentLength);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
    return jsonError(400, "Ukuran unggahan tidak valid.");
  }
  if (declaredBytes > MAX_PROFILE_IMAGE_REQUEST_BYTES) {
    return jsonError(413, "Ukuran foto maksimal 1,5 MB.");
  }
  return null;
}

export async function POST(request: Request) {
  const admin = await requestAdminMutation(request);
  if (!admin) return unauthorized();

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("multipart/form-data")) {
    return jsonError(415, "Unggah foto harus menggunakan formulir multipart.");
  }

  const contentLengthError = validContentLength(request);
  if (contentLengthError) return contentLengthError;

  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(
        400,
        "Foto tidak dapat dibaca. Pilih berkas JPG, PNG, atau WebP lalu coba lagi.",
      );
    }

    const image = form.get("image");
    if (!(image instanceof File) || image.size <= 0) {
      return jsonError(400, "Pilih foto dari perangkat terlebih dahulu.");
    }

    const db = getDb();
    const [currentProfile] = await db
      .select({ profileImageKey: villageProfile.profileImageKey })
      .from(villageProfile)
      .where(eq(villageProfile.id, "main"))
      .limit(1);

    if (!currentProfile) {
      return jsonError(
        409,
        "Simpan Profil & Statistik terlebih dahulu sebelum mengganti foto.",
      );
    }

    const validatedImage = await validateDirectoryImage(image);
    const imageKey = villageProfileMediaKey(validatedImage.mime);
    const media = getMediaBucket();

    await media.put(imageKey, validatedImage.bytes, {
      httpMetadata: { contentType: validatedImage.mime },
      customMetadata: { resource: "village-profile" },
    });

    let profile;
    try {
      [profile] = await db
        .update(villageProfile)
        .set({
          profileImageKey: imageKey,
          profileImageMime: validatedImage.mime,
          profileImageBytes: validatedImage.byteLength,
          profileImageWidth: validatedImage.width,
          profileImageHeight: validatedImage.height,
          updatedAt: new Date(),
          updatedBy: admin.email,
        })
        .where(eq(villageProfile.id, "main"))
        .returning();
    } catch (error) {
      await media.delete(imageKey).catch((cleanupError) => {
        console.error("profile image cleanup after database failure", cleanupError);
      });
      throw error;
    }

    if (!profile) {
      await media.delete(imageKey).catch((cleanupError) => {
        console.error("profile image cleanup after missing profile", cleanupError);
      });
      return jsonError(
        409,
        "Profil Desa tidak ditemukan. Muat ulang panel lalu coba lagi.",
      );
    }

    if (currentProfile.profileImageKey && currentProfile.profileImageKey !== imageKey) {
      await media.delete(currentProfile.profileImageKey).catch((cleanupError) => {
        console.error("old profile image cleanup failed", cleanupError);
      });
    }

    return Response.json(
      { profile },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("admin profile image POST failed", error);
    return uploadFailure(error);
  }
}
