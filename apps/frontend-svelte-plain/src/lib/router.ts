/**
 * Minimal history-based router for plain Svelte 5.
 * Provides navigate() and a reactive currentPath store
 * using Svelte 5 $state under the hood.
 */

let _listeners: Array<() => void> = [];
let _path = window.location.pathname;

/** Get current pathname */
export function getCurrentPath(): string {
  return _path;
}

/** Navigate to a new path using History API */
export function navigate(path: string): void {
  if (path === _path) return;
  window.history.pushState(null, "", path);
  _path = path;
  _listeners.forEach((fn) => fn());
}

/** Subscribe to path changes. Returns unsubscribe function. */
export function onPathChange(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

// Handle browser back/forward
window.addEventListener("popstate", () => {
  _path = window.location.pathname;
  _listeners.forEach((fn) => fn());
});
