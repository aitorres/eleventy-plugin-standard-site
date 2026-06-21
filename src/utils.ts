/** Returns the record key (rkey), i.e. the last path segment, of an AT URI. */
export function extractRecordKey(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

/** Normalizes a PDS URL by trimming whitespace, dropping a trailing slash, and ensuring https scheme. */
export function normalizePdsUrl(url: string): string {
  let normalizedUrl = url.trim();

  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  if (normalizedUrl.length === 0) {
    throw new Error("PDS URL cannot be empty after normalization.");
  }

  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  return normalizedUrl;
}

/** Normalizes an identifier by trimming whitespace (and stripping a leading `@` from handles). */
export function normalizeIdentifier(identifier: string): string {
  let normalizedIdentifier = identifier.trim();

  if (normalizedIdentifier.startsWith("@")) {
    normalizedIdentifier = normalizedIdentifier.slice(1);
  }

  if (normalizedIdentifier.length === 0) {
    throw new Error("Identifier cannot be empty after normalization.");
  }

  return normalizedIdentifier;
}
