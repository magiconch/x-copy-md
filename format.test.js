const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseTweetUrl,
  buildTweetMarkdown,
  buildTweetMarkdownFromBlocks,
  filenameToFileUrl,
  inferImageExt,
  cleanXTitle,
  filenameSnippet,
  normalizeArticleMarkdownText,
  formatArticleTextBlock,
  blockquoteMarkdown,
  selectCanonicalStatusUrl
} = require("./dist/extension/format");

test("parseTweetUrl: extracts username and canonical url", () => {
  const out = parseTweetUrl("https://x.com/someone/status/1234567890");
  assert.equal(out.username, "someone");
  assert.equal(out.url, "https://x.com/someone/status/1234567890");
});

test("parseTweetUrl: extracts id and strips query/hash", () => {
  const out = parseTweetUrl("https://x.com/someone/status/1234567890?s=20#frag");
  assert.equal(out.id, "1234567890");
  assert.equal(out.url, "https://x.com/someone/status/1234567890");
});

test("buildTweetMarkdown: text + @username + url", () => {
  const md = buildTweetMarkdown({
    text: "hello",
    username: "someone",
    url: "https://x.com/someone/status/1"
  });
  assert.equal(md, "hello\n\n— @someone (https://x.com/someone/status/1)");
});

test("filenameToFileUrl: mac path -> file url", () => {
  const url = filenameToFileUrl("/Users/pipi/Downloads/X-Copy/a b.jpg");
  assert.equal(url, "file:///Users/pipi/Downloads/X-Copy/a%20b.jpg");
});

test("inferImageExt: pbs format param", () => {
  const ext = inferImageExt("https://pbs.twimg.com/media/abc?format=png&name=small");
  assert.equal(ext, "png");
});

test("cleanXTitle: strips X suffixes", () => {
  assert.equal(cleanXTitle("Hello | X"), "Hello");
  assert.equal(cleanXTitle("Hello / X"), "Hello");
  assert.equal(cleanXTitle("Hello on X"), "Hello");
});

test("cleanXTitle: strips author prefixes like 'alice on X: ...'", () => {
  assert.equal(cleanXTitle("alice on X: Some Title | X"), "Some Title");
  assert.equal(cleanXTitle("@alice on X: Some Title"), "Some Title");
});

test("cleanXTitle: strips localized author prefixes like 'alice 在 X 上：...'", () => {
  assert.equal(cleanXTitle("alice 在 X 上：Some Title | X"), "Some Title");
  assert.equal(cleanXTitle("alice在X上: Some Title"), "Some Title");
});

test("filenameSnippet: returns first few words for filenames", () => {
  assert.equal(filenameSnippet("Hello world this is a tweet", 12), "Hello world");
  assert.equal(filenameSnippet("  Hello\nworld  ", 50), "Hello world");
});

test("filenameSnippet: strips URLs and truncates", () => {
  assert.equal(filenameSnippet("Hello https://example.com world", 50), "Hello world");
  assert.equal(filenameSnippet("abcdefghijklmnopqrstuvwxyz", 10), "abcdefghij");
});

test("normalizeArticleMarkdownText: keeps authored paragraph breaks", () => {
  assert.equal(
    normalizeArticleMarkdownText(" first   line\n\nsecond\tline "),
    "first line\n\nsecond line"
  );
});

test("formatArticleTextBlock: preserves headings and lists", () => {
  assert.equal(formatArticleTextBlock({ tagName: "H2", text: "前言" }), "## 前言");
  assert.equal(
    formatArticleTextBlock({
      tagName: "LI",
      parentTagName: "UL",
      className: "public-DraftStyleDefault-depth1",
      text: "项目"
    }),
    "  - 项目"
  );
  assert.equal(
    formatArticleTextBlock({ tagName: "LI", parentTagName: "OL", text: "步骤" }),
    "1. 步骤"
  );
});

test("formatArticleTextBlock: preserves blockquotes", () => {
  assert.equal(
    formatArticleTextBlock({ tagName: "BLOCKQUOTE", text: "line 1\nline 2" }),
    "> line 1\n> line 2"
  );
});

test("buildTweetMarkdownFromBlocks: interleaves", () => {
  const md = buildTweetMarkdownFromBlocks({
    blocks: [
      { type: "text", text: "t1" },
      { type: "image", url: "file:///a.jpg" },
      { type: "text", text: "t2" }
    ],
    username: "someone",
    url: "https://x.com/someone/status/1"
  });
  assert.equal(
    md,
    "t1\n\n![](file:///a.jpg)\n\nt2\n\n— @someone (https://x.com/someone/status/1)"
  );
});

test("buildTweetMarkdownFromBlocks: can omit signature", () => {
  const md = buildTweetMarkdownFromBlocks({
    blocks: [{ type: "text", text: "t1" }],
    username: "someone",
    url: "https://x.com/someone/status/1",
    includeSignature: false
  });
  assert.equal(md, "t1");
});

test("blockquoteMarkdown: prefixes lines and keeps blank line", () => {
  const out = blockquoteMarkdown("a\n\nb");
  assert.equal(out, "> a\n>\n> b");
});

test("selectCanonicalStatusUrl: prefers /:user/status/:id over /i/web/status/:id", () => {
  const out = selectCanonicalStatusUrl({
    hrefs: ["/i/web/status/123?s=20", "/someone/status/123?s=20#frag"],
    baseUrl: "https://x.com/"
  });
  assert.equal(out, "https://x.com/someone/status/123");
});

test("selectCanonicalStatusUrl: returns null when no canonical url exists", () => {
  const out = selectCanonicalStatusUrl({
    hrefs: ["/i/web/status/123?s=20", "/i/status/123"],
    baseUrl: "https://x.com/"
  });
  assert.equal(out, null);
});

test("selectCanonicalStatusUrl: can filter by statusId to avoid picking quoted/other links", () => {
  const out = selectCanonicalStatusUrl({
    hrefs: ["/other/status/999", "/someone/status/123", "/someone/status/123?s=20#frag"],
    baseUrl: "https://x.com/",
    statusId: "123"
  });
  assert.equal(out, "https://x.com/someone/status/123");
});
