export interface ActivatableWorker {
  state: string;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
  postMessage(message: unknown): void;
}

/**
 * Wait until `replacement` is the controlling worker.
 *
 * `navigator.serviceWorker.register()` can return an already-`active` worker
 * while a newly downloaded script is still installing/waiting. Treating that
 * old `active` worker as success boots the engine against stale runtime.
 */
export function waitForServiceWorkerActivation(
  replacement: ActivatableWorker,
  isReplacementActive: () => boolean,
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const replacementReady = () =>
      replacement.state === "activated" || isReplacementActive();
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      replacement.removeEventListener("statechange", stateChanged);
      if (error) reject(error);
      else resolve();
    };
    const stateChanged = () => {
      if (replacement.state === "installed") {
        replacement.postMessage({ type: "SKIP_WAITING" });
      } else if (replacement.state === "activated") {
        finish();
      } else if (replacement.state === "redundant") {
        finish(new Error("Service worker install failed"));
      }
    };
    const timeout = setTimeout(() => {
      if (replacementReady()) finish();
      else finish(new Error("Service worker activation timed out"));
    }, timeoutMs);
    replacement.addEventListener("statechange", stateChanged);
    stateChanged();
  });
}
