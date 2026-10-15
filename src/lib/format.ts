export function formatBytes(byteCount: number): string {
  if (byteCount < 1024) {
    return `${byteCount} B`;
  }

  if (byteCount < 1024 * 1024) {
    return `${(byteCount / 1024).toFixed(byteCount >= 10 * 1024 ? 0 : 1)} KB`;
  }

  return `${(byteCount / (1024 * 1024)).toFixed(byteCount >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(new Date(value));
}

export function formatCategory(category: string): string {
  return category
    .split("-")
    .join(" ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function formatSource(source: string): string {
  return source === "file" ? "Local file" : "Pasted text";
}
