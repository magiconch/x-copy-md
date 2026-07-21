// Race-safe download completion observer shared by the background worker and tests.
// Keep this file script-style so the compiled output works with importScripts().

(() => {
  type DownloadItemLike = {
    state?: unknown;
    error?: unknown;
  };

  type DownloadDeltaLike = {
    id?: unknown;
    state?: { current?: unknown };
    error?: { current?: unknown };
  };

  type DownloadWaitApi = {
    search: () => Promise<unknown>;
    addListener: (listener: (delta: DownloadDeltaLike) => void) => void;
    removeListener: (listener: (delta: DownloadDeltaLike) => void) => void;
  };

  function waitForDownloadComplete(downloadId: number, api: DownloadWaitApi): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let listening = false;

      const cleanup = () => {
        if (!listening) return;
        listening = false;
        try {
          api.removeListener(onChanged);
        } catch {
          // Listener cleanup must not change the download result.
        }
      };

      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } else {
          resolve();
        }
      };

      const inspect = (state: unknown, error: unknown) => {
        if (error) {
          finish(error);
          return;
        }
        if (state === "complete") {
          finish();
          return;
        }
        if (state === "interrupted") finish("download interrupted");
      };

      const onChanged = (delta: DownloadDeltaLike) => {
        if (!delta || delta.id !== downloadId) return;
        inspect(delta.state?.current, delta.error?.current);
      };

      // Subscribe first, then inspect the current state. This closes both sides of
      // the race: an already-finished download is found by search(), while a download
      // that finishes during the search is caught by onChanged.
      listening = true;
      try {
        api.addListener(onChanged);
      } catch (error) {
        listening = false;
        finish(error);
        return;
      }

      Promise.resolve()
        .then(() => api.search())
        .then((items) => {
          const item = (Array.isArray(items) ? items[0] : null) as DownloadItemLike | null;
          if (item) inspect(item.state, item.error);
        })
        .catch((error) => finish(error));
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { waitForDownloadComplete };
  }

  if (typeof globalThis !== "undefined") {
    (globalThis as any).XCopyMdDownload = { waitForDownloadComplete };
  }
})();
