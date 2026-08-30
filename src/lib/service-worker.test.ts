import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForServiceWorkerActivation } from "./service-worker.ts";

class FakeWorker {
  state: string;
  readonly listeners = new Set<() => void>();

  constructor(state: string) {
    this.state = state;
  }

  addEventListener(type: string, listener: () => void) {
    if (type === "statechange") this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: () => void) {
    if (type === "statechange") this.listeners.delete(listener);
  }

  postMessage(_message: unknown) {}

  setState(state: string) {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

test("waits for the replacement worker to activate", async () => {
  const replacement = new FakeWorker("installing");
  const pending = waitForServiceWorkerActivation(
    replacement,
    () => replacement.state === "activated",
    1_000,
  );
  replacement.setState("installed");
  replacement.setState("activating");
  replacement.setState("activated");
  await pending;
});

test("timeout with a stale active worker is failure, not success", async () => {
  const replacement = new FakeWorker("installing");
  await assert.rejects(
    () => waitForServiceWorkerActivation(
      replacement,
      () => false,
      20,
    ),
    /activation timed out/,
  );
});

test("redundant replacement is a failed install even if an old worker is active", async () => {
  const replacement = new FakeWorker("installing");
  const pending = waitForServiceWorkerActivation(
    replacement,
    () => false,
    1_000,
  );
  replacement.setState("redundant");
  await assert.rejects(() => pending, /install failed/);
});
