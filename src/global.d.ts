// Minimal shims: we avoid adding external type deps for now.
declare const chrome: any;
declare function importScripts(...urls: string[]): void;

declare global {
  // Runtime global used by content scripts + background worker.
  // Kept as `any` until we decide to add stronger types.
  // eslint-disable-next-line no-var
  var XCopyMd: any;
}

export {};

