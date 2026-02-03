declare global {
  // Minimal shims: we avoid adding external type deps for now.
  const chrome: any;
  function importScripts(...urls: string[]): void;
  const module: any;

  // Runtime global used by content scripts + background worker.
  // Kept as `any` until we decide to add stronger types.
  // eslint-disable-next-line no-var
  var XCopyMd: any;
}

export {};
