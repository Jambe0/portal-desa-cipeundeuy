import "server-only";

import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

export const MAX_DIRECTORY_IMAGE_BYTES = Math.floor(1.5 * 1024 * 1024);

const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 40_000_000;

const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type DirectoryImageMime = keyof typeof IMAGE_EXTENSIONS;

export type ValidatedDirectoryImage = {
  bytes: ArrayBuffer;
  byteLength: number;
  mime: DirectoryImageMime;
  width: number;
  height: number;
};

type MediaHttpMetadata = {
  contentType?: string;
};

export type StoredMediaObject = {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: MediaHttpMetadata;
};

type MediaBucket = {
  put: (
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: MediaHttpMetadata;
      customMetadata?: Record<string, string>;
    },
  ) => Promise<void>;
  get: (key: string) => Promise<StoredMediaObject | null>;
  delete: (key: string) => Promise<void>;
};

export class MediaValidationError extends Error {}

/**
 * Kesalahan ini aman ditampilkan sebagai petunjuk untuk pengelola. Detail
 * sistem file aslinya tetap hanya dicatat ke log server.
 */
export class MediaStorageError extends Error {}

function mediaRoot() {
  // Default berada di Application root (yang pada cPanel diletakkan di luar
  // public_html). Ini membuat unggahan tetap dapat berjalan pada pemasangan
  // baru. Production sebaiknya tetap memakai folder privat eksplisit melalui
  // MEDIA_UPLOAD_DIR agar tidak ikut tertimpa saat pembaruan aplikasi.
  const configured = process.env.MEDIA_UPLOAD_DIR?.trim() || ".portal-desa-media";
  return path.resolve(process.cwd(), configured);
}

function storageFailure(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code || "")
      : "";

  if (["EACCES", "EPERM", "EROFS", "ENOSPC", "ENOENT", "ENOTDIR"].includes(code)) {
    return new MediaStorageError(
      "Folder unggahan foto belum siap. Pengelola perlu memeriksa MEDIA_UPLOAD_DIR dan izin foldernya.",
    );
  }

  return error;
}

function mediaPath(key: string) {
  if (!validMediaKey(key)) {
    throw new MediaValidationError("Kunci foto tidak valid.");
  }

  const root = mediaRoot();
  const file = path.resolve(root, key);
  if (!file.startsWith(`${root}${path.sep}`)) {
    throw new MediaValidationError("Lokasi foto tidak valid.");
  }
  return file;
}

async function ensureMediaRoot() {
  const root = mediaRoot();
  await mkdir(root, { recursive: true, mode: 0o750 });
  return root;
}

function mimeFromKey(key: string): DirectoryImageMime {
  if (key.endsWith(".jpg")) return "image/jpeg";
  if (key.endsWith(".png")) return "image/png";
  return "image/webp";
}

export function getMediaBucket(): MediaBucket {
  return {
    async put(key, value) {
      try {
        await ensureMediaRoot();
        const file = mediaPath(key);
        const handle = await open(file, "wx", 0o640);
        try {
          await handle.writeFile(Buffer.from(value));
        } finally {
          await handle.close();
        }
      } catch (error) {
        throw storageFailure(error);
      }
    },
    async get(key) {
      try {
        const bytes = await readFile(mediaPath(key));
        return {
          body: Readable.toWeb(Readable.from(bytes)) as ReadableStream<Uint8Array>,
          httpMetadata: { contentType: mimeFromKey(key) },
        };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    async delete(key) {
      try {
        await unlink(mediaPath(key));
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    },
  };
}

export function directoryMediaKey(entryId: string, mime: DirectoryImageMime) {
  const extension = IMAGE_EXTENSIONS[mime];
  return `directory-${entryId}-${randomUUID()}.${extension}`;
}

export function validDirectoryMediaKey(key: string) {
  return /^directory-[0-9a-f-]{36}-[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key);
}

/** Kunci foto untuk satu gambar yang tampil pada bagian Mengenal Desa. */
export function villageProfileMediaKey(mime: DirectoryImageMime) {
  const extension = IMAGE_EXTENSIONS[mime];
  return `profile-${randomUUID()}.${extension}`;
}

export function validVillageProfileMediaKey(key: string) {
  return /^profile-[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key);
}

function validMediaKey(key: string) {
  return validDirectoryMediaKey(key) || validVillageProfileMediaKey(key);
}

function matches(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function detectMime(bytes: Uint8Array): DirectoryImageMime | null {
  if (bytes.length >= 3 && matches(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (bytes.length >= 8 && matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 12 && matches(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

function jpegDimensions(bytes: Uint8Array) {
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2 || offset + segmentLength + 2 > bytes.length) break;
    if (sofMarkers.has(marker)) {
      return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
    }
    offset += segmentLength + 2;
  }
  return null;
}

function pngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (chunk === "VP8X") return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) };
  if (chunk === "VP8 " && matches(bytes, 23, [0x9d, 0x01, 0x2a])) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function imageDimensions(bytes: Uint8Array, mime: DirectoryImageMime) {
  if (mime === "image/jpeg") return jpegDimensions(bytes);
  if (mime === "image/png") return pngDimensions(bytes);
  return webpDimensions(bytes);
}

export async function validateDirectoryImage(file: File): Promise<ValidatedDirectoryImage> {
  if (file.size <= 0) throw new MediaValidationError("Pilih foto yang akan diunggah.");
  if (file.size > MAX_DIRECTORY_IMAGE_BYTES) throw new MediaValidationError("Ukuran foto maksimal 1,5 MB.");
  const declaredMime = file.type.toLowerCase();
  if (!(declaredMime in IMAGE_EXTENSIONS)) throw new MediaValidationError("Format foto harus JPEG, PNG, atau WebP.");
  const bytes = await file.arrayBuffer();
  const byteView = new Uint8Array(bytes);
  const detectedMime = detectMime(byteView);
  if (!detectedMime || detectedMime !== declaredMime) throw new MediaValidationError("Isi file foto tidak sesuai dengan format yang dipilih.");
  const dimensions = imageDimensions(byteView, detectedMime);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    throw new MediaValidationError("Dimensi foto tidak dapat dibaca atau terlalu besar.");
  }
  return { bytes, byteLength: bytes.byteLength, mime: detectedMime, width: dimensions.width, height: dimensions.height };
}
