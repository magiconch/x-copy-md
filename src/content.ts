// @ts-nocheck
// Content script: captures right-click location, extracts tweet/article data, writes Markdown to clipboard.

(() => {
  // -------------------- State + settings
  const SETTINGS_DEFAULTS = {
    autoMarkdownCopy: false,
    useLocalImages: true
  };

  /**
   * Keep state in one place so event handlers always read the same closure values.
   * This also fixes the previous scope bug where `lastPointer` was referenced outside
   * its defining IIFE.
   */
  type PointerState = { x: number | null; y: number | null; target: EventTarget | null };
  const state = {
    settings: { ...SETTINGS_DEFAULTS },
    lastContextMenuTarget: null as EventTarget | null,
    lastPointer: { x: null, y: null, target: null } as PointerState
  };

  function loadSettings() {
    try {
      chrome.storage?.sync?.get(SETTINGS_DEFAULTS, (res) => {
        if (chrome.runtime.lastError) return;
        state.settings = { ...state.settings, ...res };
      });
    } catch {
      // ignore
    }
  }

  function installSettingsSync() {
    try {
      chrome.storage?.onChanged?.addListener((changes, area) => {
        if (area !== "sync") return;
        for (const [k, v] of Object.entries(changes || {})) {
          state.settings[k] = v?.newValue;
        }
      });
    } catch {
      // ignore
    }
  }

  function setLastPointer(e) {
    state.lastPointer = { x: e.clientX, y: e.clientY, target: e.target };
  }

  installSettingsSync();
  loadSettings();

  document.addEventListener(
    "contextmenu",
    (e) => {
      state.lastContextMenuTarget = e.target;
    },
    true
  );

  document.addEventListener("mousemove", setLastPointer, true);
  document.addEventListener("pointerdown", setLastPointer, true);

// -------------------- DOM helpers (X/Twitter heuristics)
function closestArticle(el) {
  if (!el || typeof el.closest !== "function") return null;
  return el.closest("article");
}

function statusIdFromHref(href) {
  const m = String(href ?? "").match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

function isInQuotedTweetContainer(el) {
  // X's DOM changes often; keep heuristics loose and additive.
  return Boolean(
    el?.closest?.(
      [
        '[data-testid="quoteTweet"]',
        '[data-testid="quotedTweet"]',
        '[data-testid="tweetQuote"]',
        '[data-testid="quoteTweetContainer"]'
      ].join(",")
    )
  );
}

function findFirstStatusTimeLink(rootEl, predicate) {
  const timeLinks = Array.from(rootEl.querySelectorAll('a[href*="/status/"]')).filter((a) =>
    a.querySelector("time")
  );
  return timeLinks.find(predicate) || null;
}

function hasStatusLinkToId(rootEl, id) {
  if (!rootEl || !id) return false;
  const links = rootEl.querySelectorAll('a[href*="/status/"]');
  for (const a of links) {
    if (statusIdFromHref(a.getAttribute("href")) === id) return true;
  }
  return false;
}

function findQuoteRoot(article, mainTweetId) {
  // Best case: X marks quote card with a data-testid container.
  const marked = article.querySelector(
    [
      '[data-testid="quoteTweet"]',
      '[data-testid="quotedTweet"]',
      '[data-testid="tweetQuote"]',
      '[data-testid="quoteTweetContainer"]'
    ].join(",")
  );
  if (marked) return marked;

  // Some X variants don't expose a stable data-testid on the quote card, but they do
  // render it as a clickable "card" (often role=link) containing a status link that
  // isn't the main tweet.
  for (const card of Array.from(article.querySelectorAll('[role="link"]'))) {
    const hasText = Boolean(card.querySelector('div[data-testid="tweetText"]'));
    if (!hasText) continue;
    if (hasStatusLinkToId(card, mainTweetId)) continue;
    const links = Array.from(card.querySelectorAll('a[href*="/status/"]'));
    const other = links.find((a) => {
      const id = statusIdFromHref(a.getAttribute("href"));
      return id && id !== mainTweetId;
    });
    if (other) return card;
  }

  // Fallback: locate the quoted tweet's time link, then walk up to a container
  // that contains quoted content but not the main tweet link.
  const quotedTimeLink = findFirstStatusTimeLink(article, (a) => {
    const id = statusIdFromHref(a.getAttribute("href"));
    return id && id !== mainTweetId;
  });
  if (!quotedTimeLink) return null;

  const quotedId = statusIdFromHref(quotedTimeLink.getAttribute("href"));
  let cur = quotedTimeLink.parentElement;
  for (let i = 0; i < 14 && cur && cur !== article; i++, cur = cur.parentElement) {
    const hasText = Boolean(cur.querySelector('div[data-testid="tweetText"]'));
    const hasQuoted = hasStatusLinkToId(cur, quotedId);
    const hasMain = hasStatusLinkToId(cur, mainTweetId);
    if (hasText && hasQuoted && !hasMain) return cur;
  }

  // Last resort: clickable quote cards often use role=link.
  return quotedTimeLink.closest('div[role="link"]');
}

function isInMainTweetContent(el, mainTweetId) {
  if (!el) return false;

  // If this node is inside a quoted tweet container, exclude it.
  if (isInQuotedTweetContainer(el)) return false;

  // Many quoted tweets are wrapped in a link to the quoted status.
  // If we're inside a status link whose id != the main tweet id, exclude.
  const statusLink = el.closest?.('a[href*="/status/"]');
  const linkedId = statusIdFromHref(statusLink?.getAttribute?.("href"));
  if (linkedId && mainTweetId && linkedId !== mainTweetId) return false;

  return true;
}

function isInQuotedTweetContent(el, mainTweetId) {
  if (!el) return false;

  if (isInQuotedTweetContainer(el)) return true;

  const statusLink = el.closest?.('a[href*="/status/"]');
  const linkedId = statusIdFromHref(statusLink?.getAttribute?.("href"));
  if (linkedId && mainTweetId && linkedId !== mainTweetId) return true;

  return false;
}

function extractTweetPermalink(article) {
  // IMPORTANT: quoted tweets may contain their own status/time links inside the
  // same outer <article>. Prefer the time link that is NOT inside a quote card.
  const timeEls = Array.from(article.querySelectorAll('a[href*="/status/"] time'));
  const timeEl = timeEls.find((t) => !isInQuotedTweetContainer(t)) || timeEls[0];
  const timeLink = timeEl?.closest?.('a[href*="/status/"]');

  let link = timeLink;
  if (!link) {
    const statusLinks = Array.from(article.querySelectorAll('a[href*="/status/"]'));
    link = statusLinks.find((a) => !isInQuotedTweetContainer(a)) || statusLinks[0] || null;
  }

  const href = link?.getAttribute?.("href");
  if (!href) return null;
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return null;
  }
}

function extractQuotedTweetPermalink(quoteRoot, mainTweetId) {
  if (!quoteRoot) return null;
  const aTime = findFirstStatusTimeLink(quoteRoot, (a0) => {
    const id = statusIdFromHref(a0.getAttribute("href"));
    return id && id !== mainTweetId;
  });

  let href = aTime?.getAttribute?.("href") || "";
  if (!href) {
    const a = Array.from(quoteRoot.querySelectorAll('a[href*="/status/"]')).find((a0) => {
      const id = statusIdFromHref(a0.getAttribute("href"));
      return id && id !== mainTweetId;
    });
    href = a?.getAttribute?.("href") || "";
  }

  if (!href) return null;
  try {
    return new URL(href, window.location.href).toString();
  } catch {
    return null;
  }
}

function compareDomOrder(a, b) {
  if (a === b) return 0;
  const pos = a.compareDocumentPosition(b);
  if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function normalizePbsImageUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.hostname === "pbs.twimg.com" && u.pathname.startsWith("/media/")) {
      // Keep format as-is, just request original size when possible.
      u.searchParams.set("name", "orig");
      return u.toString();
    }
  } catch {
    // fall through
  }
  return String(url ?? "");
}

function canonicalizeUrl(url) {
  try {
    const u = new URL(String(url), window.location.href);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function parseXStatusOrArticleUrl(inputUrl) {
  let u;
  try {
    u = new URL(String(inputUrl), window.location.href);
  } catch {
    return null;
  }

  // /<username>/status/<id> or /<username>/article/<id>
  const m = u.pathname.match(/^\/([^/]+)\/(status|article)\/(\d+)/);
  if (!m) return null;
  u.search = "";
  u.hash = "";
  return { username: m[1], kind: m[2], id: m[3], url: u.toString() };
}

// -------------------- X Article extraction
function isBoilerplateContainer(el) {
  // Heuristic: skip common non-content areas when extracting long-form article text.
  return Boolean(el?.closest?.("nav,header,footer,aside,form"));
}

function isXArticleHref(href) {
  const s = String(href ?? "");
  // X articles have shown up as /<user>/article/<id> and /i/article/<id> variants.
  return s.includes("/article/") || s.includes("/i/article/") || s.includes("/i/articles/");
}

function cleanXTitle(raw) {
  const fn = globalThis.XCopyMd?.cleanXTitle;
  if (typeof fn === "function") return fn(raw);

  // Fallback (shouldn't happen because manifest loads format.js before content.js).
  let t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t.replace(/\s+\|\s+X$/i, "");
  t = t.replace(/\s+\/\s+X$/i, "");
  t = t.replace(/\s+on\s+X$/i, "");
  t = t.replace(/^(.+?)\s+on\s+X:\s*/i, "");
  t = t.replace(/^(.+?)\s*在\s*X\s*上\s*[:：]\s*/i, "");
  t = t.replace(/^X\s*[:：]\s*/i, "");
  return t.trim();
}

function extractXArticleTitle(doc, richEl) {
  // Prefer the visible title near the rich text area.
  const container =
    richEl?.closest?.('main[role="main"],main,article,div[role="main"]') || doc?.body || null;

  const candidates = [];

  // Prefer metadata first. On X, visible headings can be ambiguous (UI chrome, nav, author),
  // while og/twitter titles are usually the canonical long-form title.
  for (const metaSel of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    const m = doc.querySelector(metaSel);
    const text = cleanXTitle(m?.getAttribute?.("content"));
    if (text) candidates.push(text);
  }

  // Visible title near rich text.
  if (container) {
    for (const el of Array.from(container.querySelectorAll("h1"))) {
      if (isBoilerplateContainer(el)) continue;
      const text = cleanXTitle(el.textContent);
      if (text) candidates.push(text);
    }
  }

  // Some layouts may not use <h1> for the title; try a few common hooks.
  for (const sel of [
    // Observed on some locales: title lives here.
    '[data-testid="twitter-article-title"]',
    '[data-testid="articleTitle"]',
    '[data-testid="longformTitle"]',
    '[data-testid="article-title"]'
  ]) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    if (isBoilerplateContainer(el)) continue;
    const text = cleanXTitle(el.textContent);
    if (text) candidates.push(text);
  }

  const titleTag = cleanXTitle(doc.querySelector("title")?.textContent);
  if (titleTag) candidates.push(titleTag);

  // Pick the first non-empty; de-dupe while preserving order.
  const seen = new Set();
  for (const t of candidates) {
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    return t;
  }
  return "";
}

// -------------------- Markdown extraction helpers
function wrapBoldMarkdown(s) {
  const m = String(s ?? "").match(/^(\s*)(.*?)(\s*)$/s);
  if (!m) return `**${String(s ?? "")}**`;
  const lead = m[1] || "";
  const core = m[2] || "";
  const trail = m[3] || "";
  if (!core) return String(s ?? "");
  return `${lead}**${core}**${trail}`;
}

function maxBacktickRun(s) {
  let max = 0;
  let cur = 0;
  for (const ch of String(s ?? "")) {
    if (ch === "`") {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

function wrapInlineCodeMarkdown(s) {
  const text = String(s ?? "");
  if (!text.trim()) return text;

  const n = Math.max(1, maxBacktickRun(text) + 1);
  const fence = "`".repeat(n);

  // Per CommonMark, if code starts/ends with a space, pad with a space inside the fence.
  const needsPadding = /^\s|\s$/.test(text);
  const body = needsPadding ? ` ${text} ` : text;
  return `${fence}${body}${fence}`;
}

function wrapFencedCodeBlock(code, lang = "") {
  const src = String(code ?? "").replace(/\r\n/g, "\n");
  const n = Math.max(3, maxBacktickRun(src) + 1);
  const fence = "`".repeat(n);
  const language = String(lang || "").trim();
  const info = language ? `${language}` : "";
  const body = src.replace(/\s+$/g, ""); // trim only the end
  return `${fence}${info}\n${body}\n${fence}`;
}

function isBoldElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "B" || tag === "STRONG") return true;
  const style = String(el.getAttribute?.("style") || "");
  return /font-weight\s*:\s*bold/i.test(style);
}

function isInlineCodeElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "CODE" || tag === "KBD" || tag === "SAMP") return true;
  const style = String(el.getAttribute?.("style") || "");
  return /font-family\s*:\s*monospace/i.test(style);
}

function nodeToInlineMarkdown(node, { bold = false, code = false } = {}) {
  if (!node) return "";
  if (node.nodeType === 3) return String(node.nodeValue || "");
  if (node.nodeType !== 1) return "";

  const el = node;
  const tag = String(el.tagName || "").toUpperCase();

  // X sometimes renders emoji as non-text elements with role="img" and an aria-label.
  // Prefer the actual glyph when present; otherwise fall back to the label so we don't drop it.
  if (tag !== "IMG" && String(el.getAttribute?.("role") || "").toLowerCase() === "img") {
    const aria = String(el.getAttribute?.("aria-label") || "").trim();
    const title = String(el.getAttribute?.("title") || "").trim();
    if (aria) return aria;
    if (title) return title;
  }

  // Preserve author-inserted newlines (X uses <br> for hard line breaks).
  if (tag === "BR") return "\n";
  // X sometimes renders emojis as <img alt="..."> in the tweet text.
  if (tag === "IMG") {
    const alt = String(el.getAttribute?.("alt") || "").trim();
    const aria = String(el.getAttribute?.("aria-label") || "").trim();
    const title = String(el.getAttribute?.("title") || "").trim();
    return alt || aria || title;
  }

  const nextBold = bold || isBoldElement(el);
  const nextCode = code || isInlineCodeElement(el);
  let s = "";
  for (const child of Array.from(el.childNodes || [])) {
    // Inline code should not contain newlines.
    s += nodeToInlineMarkdown(child, { bold: nextBold, code: nextCode });
  }

  if (nextCode && !code) return wrapInlineCodeMarkdown(s.replace(/\s*\n\s*/g, " ").trim());

  // Only wrap at the point bold turns on, to avoid nested **...**.
  if (nextBold && !bold) return wrapBoldMarkdown(s);
  return s;
}

function extractTweetTextMarkdown(tweetTextEl) {
  // IMPORTANT: Do NOT use `innerText` here.
  // `innerText` includes "soft wraps" based on the current column width, which causes
  // random newlines around mentions/links when the UI is narrow.
  // Instead, walk the DOM and only emit newlines for actual <br> nodes.
  const raw = nodeToInlineMarkdown(tweetTextEl);
  return String(raw ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .trim();
}

function extractXArticleUrlFromTweetArticle(tweetArticleEl, { username, id } = {}) {
  // If the user is already on an article page, just use the current URL.
  const current = canonicalizeUrl(window.location.href);
  if (current && isXArticleHref(current)) return current;

  if (!tweetArticleEl) return null;

  // Prefer a link inside the tweet card that clearly points to an article.
  const links = Array.from(tweetArticleEl.querySelectorAll("a[href]"));
  const candidates = [];
  for (const a of links) {
    const href = a.getAttribute("href");
    if (!isXArticleHref(href)) continue;
    const abs = canonicalizeUrl(href);
    if (abs) candidates.push(abs);
  }

  if (candidates.length) {
    // If we can, prefer the one that ends with the same id.
    if (id) {
      const exact = candidates.find((u) => u.endsWith(`/article/${id}`) || u.endsWith(`/i/article/${id}`));
      if (exact) return exact;
    }
    return candidates[0];
  }

  // Fallback: look for a matching article link elsewhere on the page (some layouts
  // render the article card outside the main <article> container).
  if (id) {
    const globalLinks = Array.from(document.querySelectorAll('a[href*="/article/"],a[href*="/i/article/"]'));
    const match = globalLinks.find((a) => String(a.getAttribute("href") || "").includes(String(id)));
    const href = match?.getAttribute?.("href");
    const abs = canonicalizeUrl(href);
    if (abs) return abs;
  }

  return null;
}

function extractXArticleBlocksFromDocument(doc) {
  if (!doc) return [];

  // X long-form articles frequently render content via Draft.js, not <p>.
  // Prefer the dedicated rich text container when present to avoid pulling UI chrome.
  const rich = doc.querySelector('div[data-testid="longformRichTextComponent"]');
  if (rich) {
    const items = [];

    // Title (if available on the page).
    const title = extractXArticleTitle(doc, rich);
    if (title) items.push({ el: rich, block: { type: "text", text: `# ${title}` } });

    // Draft.js blocks (treat each block as a paragraph).
    const blocks = Array.from(rich.querySelectorAll('[data-block="true"]'));
    for (const b of blocks) {
      // Draft.js "code-block" often renders as <pre ... class="public-DraftStyleDefault-pre">...
      // Some X longform variants wrap code in additional containers.
      const cls = String(b.className || "");
      const pre = b.tagName === "PRE" ? b : b.querySelector?.("pre");
      const isCodeBlock =
        b.tagName === "PRE" ||
        /\bpublic-DraftStyleDefault-pre\b/.test(cls) ||
        /\bDraftStyleDefault-pre\b/.test(cls) ||
        Boolean(pre) ||
        Boolean(b.querySelector?.("code"));

      if (isCodeBlock) {
        const srcEl = pre || b;
        const code = String(srcEl.innerText || srcEl.textContent || "")
          .replace(/\u00a0/g, " ")
          .replace(/\r\n/g, "\n");
        const trimmed = code.replace(/\s+$/g, "");
        if (!trimmed.trim()) continue;
        items.push({ el: b, block: { type: "text", text: wrapFencedCodeBlock(trimmed) } });
        continue;
      }

      const raw = nodeToInlineMarkdown(b);
      const text = String(raw).replace(/\s+/g, " ").trim();
      if (!text) continue;
      items.push({ el: b, block: { type: "text", text } });
    }

    // Images near the rich text area (article content).
    const rootForImages =
      rich.closest?.('main[role="main"],main,article,div[role="main"]') || doc.body || rich;
    for (const img of Array.from(rootForImages.querySelectorAll("img"))) {
      if (isBoilerplateContainer(img)) continue;
      const src = img.currentSrc || img.src || img.getAttribute("src");
      if (!src) continue;
      const url = normalizePbsImageUrl(src);
      if (!String(url).includes("twimg.com")) continue;
      items.push({ el: img, block: { type: "image", url } });
    }

    items.sort((a, b) => compareDomOrder(a.el, b.el));

    const out = [];
    for (const it of items) {
      const prev = out[out.length - 1];
      if (
        prev &&
        prev.type === it.block.type &&
        ((prev.type === "text" && prev.text === it.block.text) ||
          (prev.type === "image" && prev.url === it.block.url))
      ) {
        continue;
      }
      out.push(it.block);
    }

    // Avoid duplicating the title if the first paragraph already matches it.
    if (out.length >= 2 && title) {
      const first = String(out[0]?.text || "").trim();
      const second = String(out[1]?.text || "").trim();
      if (first === `# ${title}` && (second === title || second === `# ${title}`)) {
        out.splice(0, 1);
      }
    }
    return out;
  }

  // Build candidate roots from obvious containers and the title's ancestor chain.
  const roots = new Set();
  const h1 = doc.querySelector("h1");
  if (h1) {
    let cur = h1;
    for (let i = 0; i < 8 && cur; i++, cur = cur.parentElement) {
      if (cur.nodeType === 1) roots.add(cur);
      if (cur.tagName === "MAIN" || cur.tagName === "ARTICLE") break;
    }
  }
  for (const sel of [
    'main[role="main"]',
    "main",
    "article",
    'div[role="main"]',
    '[data-testid*="article"]',
    '[data-testid*="Article"]'
  ]) {
    for (const el of doc.querySelectorAll(sel)) roots.add(el);
  }

  // Score roots by paragraph count and total text length.
  let best = null;
  let bestScore = 0;
  for (const root of roots) {
    const ps = Array.from(root.querySelectorAll("p")).filter((p) => !isBoilerplateContainer(p));
    const longPs = ps.filter((p) => String(p.textContent || "").trim().length >= 30);
    const textLen = longPs.reduce((acc, p) => acc + String(p.textContent || "").trim().length, 0);
    const score = longPs.length * 250 + Math.min(textLen, 20000);
    if (score > bestScore) {
      bestScore = score;
      best = root;
    }
  }

  const rootEl = best || doc.querySelector('main[role="main"]') || doc.body;
  if (!rootEl) return [];

  const items = [];

  // Text-ish blocks: headings, paragraphs, list items.
  for (const el of rootEl.querySelectorAll("h1,h2,h3,p,li")) {
    if (isBoilerplateContainer(el)) continue;
    const raw = String(el.textContent || "");
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) continue;

    // Avoid pulling common X UI labels in edge cases.
    if (
      text === "Reply" ||
      text === "Repost" ||
      text === "Like" ||
      text === "Bookmark" ||
      text === "Share"
    ) {
      continue;
    }

    let mdText = text;
    const tag = el.tagName;
    if (tag === "H1") mdText = `# ${text}`;
    else if (tag === "H2") mdText = `## ${text}`;
    else if (tag === "H3") mdText = `### ${text}`;
    else if (tag === "LI") mdText = `- ${text}`;
    items.push({ el, block: { type: "text", text: mdText } });
  }

  // Images inside the article content.
  for (const img of rootEl.querySelectorAll("img")) {
    if (isBoilerplateContainer(img)) continue;
    const src = img.currentSrc || img.src || img.getAttribute("src");
    if (!src) continue;
    // X-hosted media is usually on pbs.twimg.com.
    const url = normalizePbsImageUrl(src);
    if (!url) continue;
    if (!String(url).includes("twimg.com")) continue;
    items.push({ el: img, block: { type: "image", url } });
  }

  items.sort((a, b) => compareDomOrder(a.el, b.el));

  // De-dupe adjacent duplicates.
  const blocks = [];
  for (const it of items) {
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      prev.type === it.block.type &&
      ((prev.type === "text" && prev.text === it.block.text) ||
        (prev.type === "image" && prev.url === it.block.url))
    ) {
      continue;
    }
    blocks.push(it.block);
  }

  return blocks;
}

async function fetchXArticleBlocks(articleUrl) {
  const url = canonicalizeUrl(articleUrl);
  if (!url) return null;

  const current = canonicalizeUrl(window.location.href);
  if (current && canonicalizeUrl(url) === current && isXArticleHref(current)) {
    const blocks = extractXArticleBlocksFromDocument(document);
    return blocks && blocks.length ? blocks : null;
  }

  // NOTE: Do not fetch+parse article HTML from a status page. X frequently serves
  // a "JavaScript disabled" fallback to raw fetch(). We instead prompt the user
  // to switch to the article page and copy there.
  return null;
}

function extractOrderedBlocks(
  rootEl,
  mainTweetId,
  { excludeRoot = null, mode = "main", assumeAllInRoot = false } = {}
) {
  const items = [];

  // Text blocks.
  for (const el of rootEl.querySelectorAll('div[data-testid="tweetText"]')) {
    if (excludeRoot && excludeRoot.contains(el)) continue;
    if (mode === "main" && !isInMainTweetContent(el, mainTweetId)) continue;
    if (mode === "quoted" && !assumeAllInRoot && !isInQuotedTweetContent(el, mainTweetId)) continue;
    const text = extractTweetTextMarkdown(el);
    if (!text) continue;
    items.push({ el, block: { type: "text", text } });
  }

  // Image blocks (static photos).
  for (const img of rootEl.querySelectorAll('div[data-testid="tweetPhoto"] img')) {
    if (excludeRoot && excludeRoot.contains(img)) continue;
    if (mode === "main" && !isInMainTweetContent(img, mainTweetId)) continue;
    if (mode === "quoted" && !assumeAllInRoot && !isInQuotedTweetContent(img, mainTweetId)) continue;
    const src = img.currentSrc || img.src;
    if (!src) continue;
    const url = normalizePbsImageUrl(src);
    items.push({ el: img, block: { type: "image", url } });
  }

  items.sort((a, b) => compareDomOrder(a.el, b.el));

  // De-dupe adjacent duplicates (X sometimes duplicates DOM nodes).
  const blocks = [];
  for (const it of items) {
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      prev.type === it.block.type &&
      ((prev.type === "text" && prev.text === it.block.text) ||
        (prev.type === "image" && prev.url === it.block.url))
    ) {
      continue;
    }
    blocks.push(it.block);
  }

  return blocks;
}

// -------------------- Chrome messaging + clipboard
function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(resp);
    });
  });
}

async function writeClipboardText(text) {
  // Preferred: async Clipboard API.
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Fallback: execCommand copy.
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.documentElement.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("execCommand(copy) failed");
}

// -------------------- UI toast
function toast(message, { position = "left", durationMs = 1800, onClick = null, title = "" } = {}) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.position = "fixed";
  el.style.zIndex = "2147483647";
  if (position === "right") el.style.right = "16px";
  else el.style.left = "16px";
  el.style.bottom = "16px";
  el.style.background = "rgba(0,0,0,0.85)";
  el.style.color = "#fff";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "8px";
  el.style.font = "13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  el.style.maxWidth = "60vw";
  el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
  if (title) el.title = title;
  if (typeof onClick === "function") {
    el.style.cursor = "pointer";
    el.addEventListener("click", () => {
      try {
        onClick();
      } catch {
        // ignore
      }
    });
  }
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), Math.max(300, Number(durationMs) || 1800));
}

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

// -------------------- Copy flows
async function copyTweetAsMarkdownFromArticle(article) {
  const url = extractTweetPermalink(article);
  if (!url) throw new Error("Tweet link not found.");

  const parsed = globalThis.XCopyMd?.parseTweetUrl?.(url);
  if (!parsed?.username || !parsed?.id || !parsed?.url) throw new Error("Could not parse tweet link.");

  const quoteRoot = findQuoteRoot(article, parsed.id);
  const tweetBlocks = extractOrderedBlocks(article, parsed.id, { excludeRoot: quoteRoot, mode: "main" });

  const quotedUrl = extractQuotedTweetPermalink(quoteRoot, parsed.id);
  const quotedParsed = quotedUrl ? globalThis.XCopyMd?.parseTweetUrl?.(quotedUrl) : null;
  const quotedBlocks = quoteRoot ?
    extractOrderedBlocks(quoteRoot, parsed.id, { mode: "quoted", assumeAllInRoot: true }) :
    [];

  // Detect X long-form articles and attempt to fetch the article page for the full body.
  let articleUrl = extractXArticleUrlFromTweetArticle(article, parsed);
  let isArticleTweet = Boolean(articleUrl) && isXArticleHref(articleUrl);

  let mainBlocks = tweetBlocks;
  let signatureUrl = parsed.url;

  if (isArticleTweet) {
    // Don't try to fetch the article HTML from here (often returns the JS-disabled fallback).
    // Prompt the user to switch to the article page and copy there, where we can extract
    // from the rendered DOM directly.
    // Per product choice: derive the article URL by swapping /status/ -> /article/
    // to avoid relying on unstable DOM links (/i/article/... variants, etc).
    const openUrl =
      canonicalizeUrl(parsed.url)?.replace(/\/status\/(\d+)/, "/article/$1") ||
      `https://x.com/${String(parsed.username)}/article/${String(parsed.id)}`;
    toast("Detected an X Article. Click to open the article page, then copy again.", {
      position: "right",
      durationMs: 4500,
      title: openUrl,
      onClick: () => window.location.assign(openUrl)
    });
    return;
  }

  if (!mainBlocks.length && !quotedBlocks.length) throw new Error("Tweet content not found.");

  // Only download images from the main tweet (not the quoted tweet), and only when enabled.
  if (Boolean(state.settings.useLocalImages)) {
    const mainImageBlocks = mainBlocks.filter((b) => b.type === "image");
    if (mainImageBlocks.length) toast(`Downloading ${mainImageBlocks.length} image(s)...`);

    // Build a deduped download request by URL to avoid double downloads.
    const seen = new Set();
    const items = [];
    let mainIdx = 0;

    for (const b of mainBlocks) {
      if (b.type !== "image") continue;
      if (seen.has(b.url)) continue;
      seen.add(b.url);
      mainIdx++;
      const ext = globalThis.XCopyMd?.inferImageExt?.(b.url) || "jpg";
      const n = String(mainIdx).padStart(2, "0");
      const prefix = isArticleTweet ? "a" : "m";
      items.push({ url: b.url, filename: `${parsed.username}-${parsed.id}-${prefix}${n}.${ext}` });
    }

    if (items.length) {
      const resp = await sendMessage({ type: "X_COPY_MD_DOWNLOAD_IMAGES", items });
      if (!resp?.ok) throw new Error(resp?.error || "Image download failed");

      const map = new Map((resp.results || []).map((r) => [r.url, r.fileUrl]));
      for (const b of mainBlocks) {
        if (b.type !== "image") continue;
        const fileUrl = map.get(b.url);
        if (fileUrl) b.url = fileUrl;
      }
    }
  }

  const mainBody = globalThis.XCopyMd.buildTweetMarkdownFromBlocks({
    blocks: mainBlocks,
    username: parsed.username,
    url: signatureUrl,
    includeSignature: false
  }).trim();

  let quotedSection = "";
  if (quotedBlocks.length) {
    const quotedBody = globalThis.XCopyMd.buildTweetMarkdownFromBlocks({
      blocks: quotedBlocks,
      username: quotedParsed?.username || "",
      url: quotedParsed?.url || "",
      includeSignature: false
    }).trim();

    const quotedLink = quotedParsed?.url || quotedUrl || "";
    const quotedCombined = [quotedBody, quotedLink].filter(Boolean).join("\n\n");
    quotedSection = globalThis.XCopyMd.blockquoteMarkdown(quotedCombined);
  }

  let md = "";
  if (mainBody && quotedSection) {
    md = `${mainBody}\n\n---\n\n${quotedSection}\n\n— @${parsed.username} (${parsed.url})`;
  } else if (quotedSection) {
    md = `${quotedSection}\n\n— @${parsed.username} (${parsed.url})`;
  } else {
    md = globalThis.XCopyMd.buildTweetMarkdownFromBlocks({
      blocks: mainBlocks,
      username: parsed.username,
      url: signatureUrl
    });
  }

  await writeClipboardText(md);
  toast("Copied");
}

async function copyXArticleAsMarkdownFromDocument() {
  const currentUrl = canonicalizeUrl(window.location.href);
  if (!currentUrl || !isXArticleHref(currentUrl)) throw new Error("Not on an X Article page.");

  const parsed = parseXStatusOrArticleUrl(currentUrl);
  const username = parsed?.username || "";
  const id = parsed?.id || "";

  const blocks = extractXArticleBlocksFromDocument(document);
  if (!blocks.length) throw new Error("Article content not found.");

  // Download images from the article when enabled.
  if (Boolean(state.settings.useLocalImages)) {
    const imageBlocks = blocks.filter((b) => b.type === "image");
    if (imageBlocks.length) toast(`Downloading ${imageBlocks.length} image(s)...`);

    const seen = new Set();
    const items = [];
    let idx = 0;
    for (const b of blocks) {
      if (b.type !== "image") continue;
      if (seen.has(b.url)) continue;
      seen.add(b.url);
      idx++;
      const ext = globalThis.XCopyMd?.inferImageExt?.(b.url) || "jpg";
      const n = String(idx).padStart(2, "0");
      items.push({ url: b.url, filename: `${username || "article"}-${id || "unknown"}-a${n}.${ext}` });
    }

    if (items.length) {
      const resp = await sendMessage({ type: "X_COPY_MD_DOWNLOAD_IMAGES", items });
      if (!resp?.ok) throw new Error(resp?.error || "Image download failed");

      const map = new Map((resp.results || []).map((r) => [r.url, r.fileUrl]));
      for (const b of blocks) {
        if (b.type !== "image") continue;
        const fileUrl = map.get(b.url);
        if (fileUrl) b.url = fileUrl;
      }
    }
  }

  const md = globalThis.XCopyMd.buildTweetMarkdownFromBlocks({
    blocks,
    username,
    url: currentUrl
  });

  await writeClipboardText(md);
  toast("Copied");
}

// -------------------- Entrypoints (runtime message + keydown)
async function handleCopyRequestFromRuntime() {
  const currentUrl = canonicalizeUrl(window.location.href);
  if (currentUrl && isXArticleHref(currentUrl)) {
    await copyXArticleAsMarkdownFromDocument();
    return;
  }

  const article = closestArticle(state.lastContextMenuTarget) || closestArticle(document.activeElement);
  if (!article) throw new Error("No tweet article found. Try right-clicking directly on the tweet.");
  await copyTweetAsMarkdownFromArticle(article);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "X_COPY_MD_COPY_TWEET") return;
  handleCopyRequestFromRuntime().catch((err) => {
    toast(`Copy failed: ${err?.message || String(err)}`);
  });
});

function handleAutoCopyKeydown(e) {
  if (!state.settings.autoMarkdownCopy) return;
  if (e.defaultPrevented) return;
  if (e.altKey) return;
  const isCopy = (e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C");
  if (!isCopy) return;

  const sel = window.getSelection?.();
  const hasSelection = Boolean(sel && String(sel).trim());
  if (hasSelection) return; // preserve default copy
  if (isEditableTarget(document.activeElement)) return;

  e.preventDefault();
  e.stopImmediatePropagation();

  const el =
    state.lastPointer.target ||
    (typeof state.lastPointer.x === "number" && typeof state.lastPointer.y === "number"
      ? document.elementFromPoint(state.lastPointer.x, state.lastPointer.y)
      : null) ||
    document.activeElement;

  const currentUrl = canonicalizeUrl(window.location.href);
  if (currentUrl && isXArticleHref(currentUrl)) {
    copyXArticleAsMarkdownFromDocument().catch((err) => {
      toast(`Copy failed: ${err?.message || String(err)}`);
    });
    return;
  }

  const article = closestArticle(el);
  if (!article) {
    toast("Copy failed: no tweet found under cursor");
    return;
  }

  copyTweetAsMarkdownFromArticle(article).catch((err) => {
    toast(`Copy failed: ${err?.message || String(err)}`);
  });
}

document.addEventListener("keydown", handleAutoCopyKeydown, true);

})();
