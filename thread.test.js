const test = require("node:test");
const assert = require("node:assert/strict");

const { selectThreadTweetIds, buildThreadMarkdown } = require("./dist/extension/thread");

test("selectThreadTweetIds: picks the contiguous self-reply chain and dedupes", () => {
  const out = selectThreadTweetIds(
    [
      { username: "alice", id: "1" },
      { username: "alice", id: "2" },
      { username: "alice", id: "2" }, // dup
      { username: "bob", id: "x" },
      { username: "carol", id: "y" },
      { username: "alice", id: "3" }
    ],
    { username: "alice", rootId: "1" }
  );
  assert.deepEqual(out, ["1", "2"]);
});

test("selectThreadTweetIds: does not include author replies in another user's branch", () => {
  const out = selectThreadTweetIds(
    [
      { username: "alice", id: "root" },
      { username: "bob", id: "reply-to-root" },
      { username: "alice", id: "reply-to-bob" }
    ],
    { username: "alice", rootId: "root" }
  );
  assert.deepEqual(out, ["root"]);
});

test("selectThreadTweetIds: if root missing, returns empty", () => {
  const out = selectThreadTweetIds([{ username: "alice", id: "2" }], { username: "alice", rootId: "1" });
  assert.deepEqual(out, []);
});

test("buildThreadMarkdown: joins tweets with separator", () => {
  const md = buildThreadMarkdown([
    { md: "t1\n\n— @a (u1)", url: "u1" },
    { md: "t2\n\n— @a (u2)", url: "u2" }
  ]);
  assert.equal(md, "t1\n\nt2\n\n— @a (u2)");
});

test("buildThreadMarkdown: does not add separators for 3+ tweets and only keeps last signature", () => {
  const md = buildThreadMarkdown([
    { md: "t1\n\n— @a (u1)", url: "u1" },
    { md: "t2\n\n— @a (u2)", url: "u2" },
    { md: "t3\n\n— @a (u3)", url: "u3" }
  ]);
  assert.equal(md, "t1\n\nt2\n\nt3\n\n— @a (u3)");
});
