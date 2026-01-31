// MV3 service worker: wires context menu -> content script message, and downloads images.

importScripts("format.js");

const MENU_ID = "copy-tweet-as-markdown";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: chrome.i18n?.getMessage?.("contextMenu_copyAsMarkdown") || "Copy tweet as Markdown",
    contexts: ["page", "selection", "link"],
    documentUrlPatterns: ["https://x.com/*", "https://twitter.com/*"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!tab?.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "X_COPY_MD_COPY_TWEET" }, () => {
    // Swallow "receiving end does not exist" until content script handler is present.
    void chrome.runtime.lastError;
  });
});

function downloadsDownload(options) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (typeof downloadId !== "number") return reject(new Error("downloadId missing"));
      resolve(downloadId);
    });
  });
}

function downloadsSearch(query) {
  return new Promise((resolve, reject) => {
    chrome.downloads.search(query, (items) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(items || []);
    });
  });
}

function waitForDownloadComplete(downloadId) {
  return new Promise((resolve, reject) => {
    const onChanged = (delta) => {
      if (!delta || delta.id !== downloadId) return;
      if (delta.error?.current) {
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(new Error(delta.error.current));
        return;
      }
      if (delta.state?.current === "complete") {
        chrome.downloads.onChanged.removeListener(onChanged);
        resolve();
        return;
      }
      if (delta.state?.current === "interrupted") {
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(new Error("download interrupted"));
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
  });
}

function sanitizeBaseFilename(name) {
  return String(name ?? "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

async function downloadOneToXCopy({ url, filename }) {
  const base = sanitizeBaseFilename(filename);
  if (!base) throw new Error("Missing filename");
  if (!url) throw new Error("Missing url");

  const downloadId = await downloadsDownload({
    url,
    filename: `X-Copy/${base}`,
    conflictAction: "uniquify",
    saveAs: false
  });

  await waitForDownloadComplete(downloadId);

  const items = await downloadsSearch({ id: downloadId });
  const item = items[0];
  if (!item?.filename) throw new Error("Downloaded file path not found");

  const fileUrl = globalThis.XCopyMd?.filenameToFileUrl?.(item.filename);
  if (!fileUrl) throw new Error("filenameToFileUrl unavailable");

  return { url, filename: item.filename, fileUrl };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "X_COPY_MD_DOWNLOAD_IMAGES") return;

  (async () => {
    const items = Array.isArray(msg.items) ? msg.items : [];
    const results = [];
    for (const it of items) {
      results.push(await downloadOneToXCopy(it));
    }
    sendResponse({ ok: true, results });
  })().catch((err) => {
    sendResponse({ ok: false, error: err?.message || String(err) });
  });

  // Keep the message channel open for async response.
  return true;
});
