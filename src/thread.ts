// Shared, testable helpers for thread ("X thread") behavior.
// Keep this file "script-style" (no ESM imports/exports) so compiled output works
// as classic extension scripts and can still be `require()`'d by Node tests.

(() => {
  type TweetRef = { username?: unknown; id?: unknown };
  type ThreadRoot = { username?: unknown; rootId?: unknown };

  function selectThreadTweetIds(_tweets?: TweetRef[], _root?: ThreadRoot): string[] {
    const tweets = Array.isArray(_tweets) ? _tweets : [];
    const username = String(_root?.username ?? "").replace(/^@/, "");
    const rootId = String(_root?.rootId ?? "");
    if (!username || !rootId) return [];

    // Find the first occurrence of rootId; only include tweets at/after it.
    const startIdx = tweets.findIndex((t) => String(t?.id ?? "") === rootId);
    if (startIdx < 0) return [];

    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of tweets.slice(startIdx)) {
      const u = String(t?.username ?? "").replace(/^@/, "");
      const id = String(t?.id ?? "");
      if (!id) continue;
      if (seen.has(id)) continue;

      // X renders a real self-reply thread as one contiguous run of posts by the
      // root author. Once another author appears, later posts by the root author
      // are replies inside other conversation branches, not continuations of the
      // root thread. Do not skip across that branch boundary.
      if (u !== username) break;

      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function buildThreadMarkdown(_items?: { md?: unknown; url?: unknown }[], _opts?: { separator?: unknown }): string {
    const items = Array.isArray(_items) ? _items : [];
    const sep = typeof _opts?.separator === "string" ? _opts.separator : "\n\n";
    const parts: string[] = [];

    function stripTrailingSignature(md: string): string {
      // Tweets are typically formatted as:
      //   <body>
      //
      //   — @user (https://x.com/user/status/<id>)
      //
      // For thread output, we keep only the final signature to avoid noisy repetition.
      return String(md ?? "").replace(/\n\n—\s+@[^)\n]+\(\s*[^)\n]+\s*\)\s*$/s, "").trim();
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let md = String(it?.md ?? "").trim();
      if (!md) continue;

      const isLast = i === items.length - 1;
      if (!isLast) md = stripTrailingSignature(md);

      if (!md) continue;
      parts.push(md);
    }
    return parts.join(sep);
  }

  // Exports for Node tests.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      selectThreadTweetIds,
      buildThreadMarkdown
    };
  }

  // Globals for content scripts.
  if (typeof globalThis !== "undefined") {
    globalThis.XCopyMdThread = {
      selectThreadTweetIds,
      buildThreadMarkdown
    };
  }
})();
