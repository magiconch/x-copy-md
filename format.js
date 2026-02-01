// Shared helpers for both Node tests (CommonJS) and browser content script.
//
// NOTE: Implemented via TDD in Task 2; keep behavior in sync with tests.

function parseTweetUrl(_input) {
  let u;
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

function buildTweetMarkdown(_args) {
  const text = String(_args?.text ?? "").trim();
  const username = String(_args?.username ?? "").replace(/^@/, "");
  const url = String(_args?.url ?? "");
  return buildTweetMarkdownFromBlocks({
    blocks: [{ type: "text", text }],
    username,
    url
  });
}

function filenameToFileUrl(filename) {
  const p = String(filename ?? "");
  // We only target macOS-style absolute paths for now.
  const withoutLeadingSlash = p.replace(/^\/+/, "");
  return `file:///${encodeURI(withoutLeadingSlash)}`;
}

function inferImageExt(url) {
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

function cleanXTitle(raw) {
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
  const qm =
    t.match(/^"(.*)"$/) ||
    t.match(/^'(.*)'$/) ||
    t.match(/^“(.*)”$/);
  if (qm) t = String(qm[1] ?? "").trim();

  return t.trim();
}

function buildTweetMarkdownFromBlocks({ blocks, username, url }) {
  const safeUser = String(username ?? "").replace(/^@/, "");
  const safeUrl = String(url ?? "");

  const parts = [];
  for (const b of blocks || []) {
    if (!b || !b.type) continue;
    if (b.type === "text") {
      const t = String(b.text ?? "").trim();
      if (t) parts.push(t);
    } else if (b.type === "image") {
      const u = String(b.url ?? "").trim();
      if (u) parts.push(`![](${u})`);
    }
  }

  const body = parts.join("\n\n").trim();
  const includeSignature =
    Object.prototype.hasOwnProperty.call(arguments[0] || {}, "includeSignature") ?
      Boolean(arguments[0].includeSignature) :
      true;

  if (!includeSignature) return body;

  if (!body) return `— @${safeUser} (${safeUrl})`;
  return `${body}\n\n— @${safeUser} (${safeUrl})`;
}

function blockquoteMarkdown(md) {
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
