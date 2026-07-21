// @ts-nocheck
// MV3 service worker: wires context menu -> content script message, and downloads images.

(() => {

importScripts("format.js", "menu.js", "download.js");

const MENU_ID_PRIMARY = "x-copy-md-primary";

const SETTINGS_DEFAULTS = {
  defaultSaveMarkdownFile: false
};

function t(key, fallback = "") {
  try {
    return chrome.i18n?.getMessage?.(key) || fallback || "";
  } catch {
    return fallback || "";
  }
}

function storageGet() {
  return new Promise((resolve) => {
    try {
      chrome.storage?.sync?.get(SETTINGS_DEFAULTS, (res) => {
        if (chrome.runtime.lastError) return resolve({ ...SETTINGS_DEFAULTS });
        resolve({ ...SETTINGS_DEFAULTS, ...(res || {}) });
      });
    } catch {
      resolve({ ...SETTINGS_DEFAULTS });
    }
  });
}

function updateContextMenuTitles(defaultSaveMarkdownFile) {
  const state = globalThis.XCopyMdMenu?.getContextMenuState?.({ defaultSaveMarkdownFile });
  if (!state) return;

  chrome.contextMenus.update(MENU_ID_PRIMARY, {
    title: t(state.primary.titleKey, state.primary.fallbackTitle)
  });
}

async function syncContextMenusFromStorage() {
  const settings = await storageGet();
  updateContextMenuTitles(Boolean(settings.defaultSaveMarkdownFile));
}

chrome.runtime.onInstalled.addListener(() => {
  // Avoid duplicate IDs on extension update.
  chrome.contextMenus.removeAll(() => {
    void chrome.runtime.lastError;

    chrome.contextMenus.create({
      id: MENU_ID_PRIMARY,
      title: t("contextMenu_copyAsMarkdown", "Copy tweet as Markdown"),
      contexts: ["page", "selection", "link"],
      documentUrlPatterns: ["https://x.com/*", "https://twitter.com/*"]
    });

    // Ensure titles match current setting (copy vs save).
    syncContextMenusFromStorage();
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  (async () => {
    const settings = await storageGet();
    const action = globalThis.XCopyMdMenu?.resolveContextMenuAction?.({
      menuItemId: info.menuItemId,
      defaultSaveMarkdownFile: settings.defaultSaveMarkdownFile,
      primaryId: MENU_ID_PRIMARY
    });
    if (!action) return;

    const type = action === "save" ? "X_COPY_MD_SAVE_TWEET_MD" : "X_COPY_MD_COPY_TWEET";
    chrome.tabs.sendMessage(tab.id, { type }, () => {
      // Swallow "receiving end does not exist" until content script handler is present.
      void chrome.runtime.lastError;
    });
  })().catch(() => {
    // ignore
  });
});

try {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "sync") return;
    if (!changes || !Object.prototype.hasOwnProperty.call(changes, "defaultSaveMarkdownFile")) return;
    updateContextMenuTitles(Boolean(changes.defaultSaveMarkdownFile?.newValue));
  });
} catch {
  // ignore
}

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
  const wait = globalThis.XCopyMdDownload?.waitForDownloadComplete;
  if (typeof wait !== "function") return Promise.reject(new Error("Download helper unavailable"));

  return wait(downloadId, {
    search: () => downloadsSearch({ id: downloadId }),
    addListener: (listener) => chrome.downloads.onChanged.addListener(listener),
    removeListener: (listener) => chrome.downloads.onChanged.removeListener(listener)
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
    filename: `X-Copy/img/${base}`,
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
  if (!msg) return;

  if (msg.type === "X_COPY_MD_DOWNLOAD_IMAGES") {
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
  }

  if (msg.type === "X_COPY_MD_SAVE_MARKDOWN_FILE") {
    (async () => {
      const rawBase = msg.baseFilename;
      const base = sanitizeBaseFilename(rawBase);
      if (!base) throw new Error("Missing baseFilename");

      const md = String(msg.markdown ?? "");
      if (!md.trim()) throw new Error("Missing markdown");

      const filename = base.toLowerCase().endsWith(".md") ? base : `${base}.md`;
      const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(md)}`;

      const downloadId = await downloadsDownload({
        url: dataUrl,
        filename: `X-Copy/md/${filename}`,
        conflictAction: "uniquify",
        saveAs: false
      });

      await waitForDownloadComplete(downloadId);

      const items = await downloadsSearch({ id: downloadId });
      const item = items[0];
      if (!item?.filename) throw new Error("Downloaded file path not found");

      const fileUrl = globalThis.XCopyMd?.filenameToFileUrl?.(item.filename);
      if (!fileUrl) throw new Error("filenameToFileUrl unavailable");

      sendResponse({ ok: true, filename: item.filename, fileUrl });
    })().catch((err) => {
      sendResponse({ ok: false, error: err?.message || String(err) });
    });

    // Keep the message channel open for async response.
    return true;
  }
});

})();
