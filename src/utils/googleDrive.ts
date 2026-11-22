export function getGoogleDriveFileId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'drive.google.com' && url.hostname !== 'docs.google.com') return null;
    if (url.pathname.includes('/folders/')) return null;
    const fileMatch = url.pathname.match(/\/d\/([A-Za-z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];
    if (url.searchParams.has('id')) return url.searchParams.get('id')?.trim() || null;
  } catch {
    return null;
  }
  return null;
}

export function normalizeGoogleDriveImageUrl(value: string): string | null {
  const id = getGoogleDriveFileId(value);
  if (!id || !/^[A-Za-z0-9_-]{20,}$/.test(id)) return null;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
}
