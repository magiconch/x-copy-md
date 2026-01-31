const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseTweetUrl,
  buildTweetMarkdown,
  buildTweetMarkdownFromBlocks,
  filenameToFileUrl,
  inferImageExt,
  blockquoteMarkdown
} = require("./format");

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
