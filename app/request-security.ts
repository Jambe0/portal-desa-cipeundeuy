import "server-only";

type LimitedJsonResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: Response };

function jsonError(status: number, error: string) {
  return Response.json(
    { error },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Read a JSON object without allowing an unbounded request body into memory.
 * Route handlers use small, explicit limits because this portal never accepts
 * file uploads through JSON.
 */
export async function readLimitedJsonObject(
  request: Request,
  maximumBytes: number,
): Promise<LimitedJsonResult> {
  const contentType = (request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      response: jsonError(415, "Permintaan harus menggunakan format JSON."),
    };
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
      return {
        ok: false,
        response: jsonError(400, "Ukuran permintaan tidak valid."),
      };
    }
    if (declaredBytes > maximumBytes) {
      return {
        ok: false,
        response: jsonError(413, "Data yang dikirim terlalu besar."),
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      response: jsonError(400, "Data JSON diperlukan."),
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel();
        return {
          ok: false,
          response: jsonError(413, "Data yang dikirim terlalu besar."),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: jsonError(400, "Data JSON tidak dapat dibaca."),
    };
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {
        ok: false,
        response: jsonError(400, "Data JSON harus berupa objek."),
      };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: jsonError(400, "Format permintaan JSON tidak valid."),
    };
  }
}
