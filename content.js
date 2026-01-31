// Content script: captures right-click location, extracts tweet data, writes Markdown to clipboard.

const SETTINGS_DEFAULTS = {
  autoMarkdownCopy: false,
  useLocalImages: true
};

let settings = { ...SETTINGS_DEFAULTS };

function loadSettings() {
  try {
    chrome.storage?.sync?.get(SETTINGS_DEFAULTS, (res) => {
      if (chrome.runtime.lastError) return;
      settings = { ...settings, ...res };
    });
  } catch {
    // ignore
  }
}

try {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, v] of Object.entries(changes || {})) {
      settings[k] = v?.newValue;
    }
  });
} catch {
  // ignore
}

loadSettings();

let lastContextMenuTarget = null;
let lastPointer = { x: null, y: null, target: null };

document.addEventListener(
  "contextmenu",
  (e) => {
    lastContextMenuTarget = e.target;
  },
  true
);

document.addEventListener(
  "mousemove",
  (e) => {
    lastPointer = { x: e.clientX, y: e.clientY, target: e.target };
  },
  true
);

document.addEventListener(
  "pointerdown",
  (e) => {
    lastPointer = { x: e.clientX, y: e.clientY, target: e.target };
  },
  true
);

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
  const a = findFirstStatusTimeLink(quoteRoot, (a0) => {
    const id = statusIdFromHref(a0.getAttribute("href"));
    return id && id !== mainTweetId;
  });
  const href = a?.getAttribute?.("href");
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

function extractOrderedBlocks(rootEl, mainTweetId, { excludeRoot = null, mode = "main" } = {}) {
  const items = [];

  // Text blocks.
  for (const el of rootEl.querySelectorAll('div[data-testid="tweetText"]')) {
    if (excludeRoot && excludeRoot.contains(el)) continue;
    if (mode === "main" && !isInMainTweetContent(el, mainTweetId)) continue;
    if (mode === "quoted" && !isInQuotedTweetContent(el, mainTweetId)) continue;
    const text = typeof el.innerText === "string" ? el.innerText.trim() : "";
    if (!text) continue;
    items.push({ el, block: { type: "text", text } });
  }

  // Image blocks (static photos).
  for (const img of rootEl.querySelectorAll('div[data-testid="tweetPhoto"] img')) {
    if (excludeRoot && excludeRoot.contains(img)) continue;
    if (mode === "main" && !isInMainTweetContent(img, mainTweetId)) continue;
    if (mode === "quoted" && !isInQuotedTweetContent(img, mainTweetId)) continue;
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

function toast(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.position = "fixed";
  el.style.zIndex = "2147483647";
  el.style.left = "16px";
  el.style.bottom = "16px";
  el.style.background = "rgba(0,0,0,0.85)";
  el.style.color = "#fff";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "8px";
  el.style.font = "13px/1.3 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  el.style.maxWidth = "60vw";
  el.style.boxShadow = "0 6px 20px rgba(0,0,0,0.25)";
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (el.isContentEditable) return true;
  return false;
}

async function copyTweetAsMarkdownFromArticle(article) {
  const url = extractTweetPermalink(article);
  if (!url) throw new Error("Tweet link not found.");

  const parsed = globalThis.XCopyMd?.parseTweetUrl?.(url);
  if (!parsed?.username || !parsed?.id || !parsed?.url) throw new Error("Could not parse tweet link.");

  const quoteRoot = findQuoteRoot(article, parsed.id);
  const mainBlocks = extractOrderedBlocks(article, parsed.id, { excludeRoot: quoteRoot, mode: "main" });

  const quotedUrl = extractQuotedTweetPermalink(quoteRoot, parsed.id);
  const quotedParsed = quotedUrl ? globalThis.XCopyMd?.parseTweetUrl?.(quotedUrl) : null;
  const quotedBlocks = quoteRoot ? extractOrderedBlocks(quoteRoot, parsed.id, { mode: "quoted" }) : [];

  if (!mainBlocks.length && !quotedBlocks.length) throw new Error("Tweet content not found.");

  // Only download images from the main tweet (not the quoted tweet), and only when enabled.
  if (Boolean(settings.useLocalImages)) {
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
      items.push({ url: b.url, filename: `${parsed.username}-${parsed.id}-m${n}.${ext}` });
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
    url: parsed.url,
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
      url: parsed.url
    });
  }

  await writeClipboardText(md);
  toast("Copied");
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "X_COPY_MD_COPY_TWEET") return;

  (async () => {
    const article = closestArticle(lastContextMenuTarget) || closestArticle(document.activeElement);
    if (!article) throw new Error("No tweet article found. Try right-clicking directly on the tweet.");
    await copyTweetAsMarkdownFromArticle(article);
  })().catch((err) => {
    toast(`Copy failed: ${err?.message || String(err)}`);
  });
});

document.addEventListener(
  "keydown",
  (e) => {
    if (!settings.autoMarkdownCopy) return;
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
      lastPointer.target ||
      (typeof lastPointer.x === "number" && typeof lastPointer.y === "number"
        ? document.elementFromPoint(lastPointer.x, lastPointer.y)
        : null) ||
      document.activeElement;

    const article = closestArticle(el);
    if (!article) {
      toast("Copy failed: no tweet found under cursor");
      return;
    }

    copyTweetAsMarkdownFromArticle(article).catch((err) => {
      toast(`Copy failed: ${err?.message || String(err)}`);
    });
  },
  true
);
