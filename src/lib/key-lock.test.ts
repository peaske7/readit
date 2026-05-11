import { describe, expect, it } from "vitest";
import { createKeyLock } from "./key-lock";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createKeyLock", () => {
  it("serializes operations on the same key", async () => {
    const withLock = createKeyLock("serial");
    const order: number[] = [];
    const a = deferred<void>();
    const b = deferred<void>();

    const p1 = withLock("k", async () => {
      await a.promise;
      order.push(1);
    });
    const p2 = withLock("k", async () => {
      await b.promise;
      order.push(2);
    });

    // p2 must NOT have started yet because p1 hasn't resolved
    b.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual([]);

    a.resolve();
    await p1;
    await p2;
    expect(order).toEqual([1, 2]);
  });

  it("runs different keys concurrently", async () => {
    const withLock = createKeyLock("concurrent");
    const order: string[] = [];
    const a = deferred<void>();

    const p1 = withLock("alpha", async () => {
      await a.promise;
      order.push("alpha");
    });
    const p2 = withLock("beta", async () => {
      order.push("beta");
    });

    await p2;
    expect(order).toEqual(["beta"]);

    a.resolve();
    await p1;
    expect(order).toEqual(["beta", "alpha"]);
  });

  it("survives a thrown error in a previous holder", async () => {
    const withLock = createKeyLock("error-recovery");
    const p1 = withLock("k", async () => {
      throw new Error("boom");
    });
    await expect(p1).rejects.toThrow("boom");

    const p2 = withLock("k", async () => 42);
    await expect(p2).resolves.toBe(42);
  });

  it("preserves resolved return values", async () => {
    const withLock = createKeyLock("return-value");
    const v = await withLock("k", async () => "value");
    expect(v).toBe("value");
  });

  it("namespaces are independent", async () => {
    const a = createKeyLock("ns-a");
    const b = createKeyLock("ns-b");
    const order: string[] = [];
    const block = deferred<void>();

    const pa = a("shared-key", async () => {
      await block.promise;
      order.push("a");
    });
    const pb = b("shared-key", async () => {
      order.push("b");
    });

    await pb;
    expect(order).toEqual(["b"]);
    block.resolve();
    await pa;
    expect(order).toEqual(["b", "a"]);
  });
});
