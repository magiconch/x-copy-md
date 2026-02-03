// Shared helpers for both Node tests (CommonJS) and browser content script.
//
// Keep this file "script-style" (no ESM imports/exports) so compiled output works
// as classic extension scripts and can still be `require()`'d by Node tests.

type ParsedTweetUrl = { username: string; id: string; url: string };

type TweetBlock =
  | { type: "text"; text?: unknown }
  | { type: "image"; url?: unknown }
  | { type: string; [k: string]: unknown };

function parseTweetUrl(_input: unknown): ParsedTweetUrl | null {
  let u: URL;
  try {
    u = new URL(String(_input));
  } catch {
    return null;
  }

  // /<username>/status/<id>
  const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
  if (!m) return null;
  // Canonicalize: keep origin+path only.
  u.search = "";
  u.hash = "";
  const username = m[1];
  const id = m[2];
  return { username, id, url: u.toString() };
}

function buildTweetMarkdown(_args: { text?: unknown; username?: unknown; url?: unknown }): string {
  const text = String(_args?.text ?? "").trim();
  const username = String(_args?.username ?? "").replace(/^@/, "");
  const url = String(_args?.url ?? "");
  return buildTweetMarkdownFromBlocks({
    blocks: [{ type: "text", text }],
    username,
    url
  });
}

function filenameToFileUrl(filename: unknown): string {
  const p = String(filename ?? "");
  // We only target macOS-style absolute paths for now.
  const withoutLeadingSlash = p.replace(/^\/+/, "");
  return `file:///${encodeURI(withoutLeadingSlash)}`;
}

function inferImageExt(url: unknown): string {
  try {
    const u = new URL(String(url));
    const fmt = u.searchParams.get("format");
    if (fmt) return String(fmt).toLowerCase();
    const m = u.pathname.match(/\.([a-z0-9]+)$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    // fall through
  }
  return "jpg";
}

function cleanXTitle(raw: unknown): string {
  let t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";

  // Strip common suffixes.
  t = t.replace(/\s+\|\s+X$/i, "");
  t = t.replace(/\s+\/\s+X$/i, "");
  t = t.replace(/\s+on\s+X$/i, "");

  // X page titles frequently include an author prefix.
  // Examples:
  // - "alice on X: Some Title"
  // - "@alice on X: Some Title"
  // - "alice ( @alice ) on X: Some Title"
  t = t.replace(/^(.+?)\s+on\s+X\s*[:：]\s*/i, "");

  // Localized variants (seen on some locales):
  // - "alice 在 X 上：Some Title"
  // - "alice在X上: Some Title"
  t = t.replace(/^(.+?)\s*在\s*X\s*上\s*[:：]\s*/i, "");

  // Some surfaces use "X: Title".
  t = t.replace(/^X\s*[:：]\s*/i, "");

  // Trim matching wrapping quotes (English or CJK).
  // Note: CJK quotes are asymmetric (“ … ”), so handle explicitly.
  const qm = t.match(/^"(.*)"$/) || t.match(/^'(.*)'$/) || t.match(/^“(.*)”$/);
  if (qm) t = String(qm[1] ?? "").trim();

  return t.trim();
}

function buildTweetMarkdownFromBlocks(_args: {
  blocks?: TweetBlock[];
  username?: unknown;
  url?: unknown;
  includeSignature?: unknown;
}): string {
  const blocks = _args?.blocks;
  const username = _args?.username;
  const url = _args?.url;

  const safeUser = String(username ?? "").replace(/^@/, "");
  const safeUrl = String(url ?? "");

  const parts: string[] = [];
  for (const b of blocks || []) {
    if (!b || !(b as any).type) continue;
    if ((b as any).type === "text") {
      const t = String((b as any).text ?? "").trim();
      if (t) parts.push(t);
    } else if ((b as any).type === "image") {
      const u = String((b as any).url ?? "").trim();
      if (u) parts.push(`![](${u})`);
    }
  }

  const body = parts.join("\n\n").trim();
  const includeSignature = Object.prototype.hasOwnProperty.call(arguments[0] || {}, "includeSignature")
    ? Boolean((arguments[0] as any).includeSignature)
    : true;

  if (!includeSignature) return body;

  if (!body) return `— @${safeUser} (${safeUrl})`;
  return `${body}\n\n— @${safeUser} (${safeUrl})`;
}

function blockquoteMarkdown(md: unknown): string {
  const lines = String(md ?? "").split("\n");
  return lines.map((l) => `> ${l}`.trimEnd()).join("\n");
}

// Exports for Node tests.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseTweetUrl,
    buildTweetMarkdown,
    buildTweetMarkdownFromBlocks,
    filenameToFileUrl,
    inferImageExt,
    cleanXTitle,
    blockquoteMarkdown
  };
}

// Globals for content scripts.
if (typeof globalThis !== "undefined") {
  globalThis.XCopyMd = {
    parseTweetUrl,
    buildTweetMarkdown,
    buildTweetMarkdownFromBlocks,
    filenameToFileUrl,
    inferImageExt,
    cleanXTitle,
    blockquoteMarkdown
  };
}

