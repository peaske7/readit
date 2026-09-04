export const VITE_DEV_PORT = 24678;
const VITE_DEV_ORIGIN = `http://127.0.0.1:${VITE_DEV_PORT}`;

export const VITE_CLIENT_ENTRY = `${VITE_DEV_ORIGIN}/src/main.ts`;

export async function proxyToVite(
  req: Request,
  pathname: string,
  search: string,
): Promise<Response> {
  const target = `${VITE_DEV_ORIGIN}${pathname}${search}`;
  try {
    return await fetch(
      new Request(target, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        redirect: "manual",
      }),
    );
  } catch {
    return new Response("Vite dev server not available", { status: 502 });
  }
}

async function isViteReady(): Promise<boolean> {
  try {
    const res = await fetch(`${VITE_DEV_ORIGIN}/`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Starts a Vite dev server unless one is already listening. */
export async function spawnViteDev(): Promise<() => void> {
  if (await isViteReady()) {
    return () => {};
  }

  const child = Bun.spawn(
    ["bunx", "vite", "--port", String(VITE_DEV_PORT), "--strictPort"],
    { stdout: "ignore", stderr: "inherit" },
  );

  const maxWaitMs = 10_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isViteReady()) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  return () => {
    child.kill();
  };
}
