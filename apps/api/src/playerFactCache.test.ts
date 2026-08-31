import { describe, expect, it, vi } from "vitest";
import { loadCachedPlayerFacts, type BackgroundTaskContext, type PlayerFactCache } from "./playerFactCache";

class MemoryCache implements PlayerFactCache {
  entries = new Map<string, Response>();

  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }

  async put(request: Request, response: Response) {
    this.entries.set(request.url, response.clone());
  }
}

function backgroundTasks() {
  const pending: Promise<unknown>[] = [];
  const ctx: BackgroundTaskContext = { waitUntil: promise => pending.push(promise) };
  return { ctx, flush: () => Promise.all(pending) };
}

describe("player fact cache", () => {
  it("stores a successful load and reuses it without another Data Center request", async () => {
    const cache = new MemoryCache();
    const tasks = backgroundTasks();
    const load = vi.fn().mockResolvedValue({ overall: 123 });

    await expect(loadCachedPlayerFacts(100190043, 1, cache, tasks.ctx, load)).resolves.toEqual({ overall: 123 });
    await tasks.flush();
    await expect(loadCachedPlayerFacts(100190043, 1, cache, tasks.ctx, load)).resolves.toEqual({ overall: 123 });

    expect(load).toHaveBeenCalledTimes(1);
    const cached = [...cache.entries.values()][0];
    expect(cached.headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("deduplicates concurrent loads for the same card and grade", async () => {
    const cache = new MemoryCache();
    const tasks = backgroundTasks();
    let resolveLoad: ((value: { overall: number }) => void) | undefined;
    const load = vi.fn(() => new Promise<{ overall: number }>(resolve => {
      resolveLoad = resolve;
    }));

    const first = loadCachedPlayerFacts(100190043, 5, cache, tasks.ctx, load);
    const second = loadCachedPlayerFacts(100190043, 5, cache, tasks.ctx, load);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    resolveLoad?.({ overall: 127 });

    await expect(Promise.all([first, second])).resolves.toEqual([{ overall: 127 }, { overall: 127 }]);
  });
});
