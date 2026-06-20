export function extractRecordKey(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

export function normalizePdsUrl(url: string): string {
  let normalizedUrl = url.trim();

  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  if (normalizedUrl.endsWith("/")) {
    normalizedUrl = normalizedUrl.slice(0, -1);
  }

  return normalizedUrl;
}

export function normalizeIdentifier(identifier: string): string {
  let normalizedIdentifier = identifier.trim();

  if (normalizedIdentifier.startsWith("@")) {
    normalizedIdentifier = normalizedIdentifier.slice(1);
  }

  return normalizedIdentifier;
}
