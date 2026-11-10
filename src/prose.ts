export function prose(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return String(parsed.answer || parsed.summary || parsed.body || raw).slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}
