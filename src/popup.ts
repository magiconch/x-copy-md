// @ts-nocheck

(() => {
const DEFAULTS = {
  autoMarkdownCopy: false,
  useLocalImages: true
};

function t(key) {
  try {
    return chrome.i18n.getMessage(key) || "";
  } catch {
    return "";
  }
}

function applyI18n() {
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    const msg = t(key);
    if (msg) el.textContent = msg;
  }

  const title = t("popup_title");
  if (title) document.title = title;
}

function setStatus(text, isError) {
  const el = document.getElementById("status");
  el.textContent = text || "";
  el.style.color = isError ? "#b00" : "#0b5";
}

function getEls() {
  return {
    autoMarkdownCopy: document.getElementById("autoMarkdownCopy"),
    useLocalImages: document.getElementById("useLocalImages")
  };
}

function storageGet() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(DEFAULTS, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(res);
    });
  });
}

function storageSet(patch) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(patch, () => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve();
    });
  });
}

async function init() {
  applyI18n();
  const els = getEls();
  const settings = await storageGet();
  els.autoMarkdownCopy.checked = Boolean(settings.autoMarkdownCopy);
  els.useLocalImages.checked = Boolean(settings.useLocalImages);

  els.autoMarkdownCopy.addEventListener("change", async () => {
    try {
      await storageSet({ autoMarkdownCopy: els.autoMarkdownCopy.checked });
      setStatus(t("popup_status_saved") || "Saved");
      setTimeout(() => setStatus(""), 800);
    } catch (e) {
      setStatus(e.message || String(e), true);
    }
  });

  els.useLocalImages.addEventListener("change", async () => {
    try {
      await storageSet({ useLocalImages: els.useLocalImages.checked });
      setStatus(t("popup_status_saved") || "Saved");
      setTimeout(() => setStatus(""), 800);
    } catch (e) {
      setStatus(e.message || String(e), true);
    }
  });
}

init().catch((e) => setStatus(e.message || String(e), true));

})();
