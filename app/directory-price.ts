const MAX_PRICE_AMOUNT = 1_000_000_000_000;

function parseDirectoryPrice(value: unknown) {
  if (typeof value !== "string") return null;

  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  const match = normalized.match(
    /^(?:mulai\s*)?(?:rp\.?\s*)?([0-9][0-9.\s]*)$/iu,
  );

  if (!match) return null;

  const numericPart = match[1].replace(/\s/g, "");
  const validGrouping = numericPart.includes(".")
    ? /^\d{1,3}(?:\.\d{3})+$/.test(numericPart)
    : /^\d+$/.test(numericPart);

  if (!validGrouping) return null;

  const amount = Number(numericPart.replace(/\./g, ""));
  if (
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > MAX_PRICE_AMOUNT
  ) {
    return null;
  }

  return amount;
}

export function normalizeDirectoryPrice(value: unknown) {
  const amount = parseDirectoryPrice(value);
  if (amount === null) return null;

  return `Mulai Rp${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

export function displayDirectoryMeta(
  kind: "umkm" | "service",
  value: string,
) {
  if (kind === "service") return value;
  return normalizeDirectoryPrice(value) || value;
}
