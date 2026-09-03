import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FontFamilies } from "../schema";
import serverInfoFixture from "./__fixtures__/server-info.json";
import {
  canonicalizePath,
  commentsDir,
  DEFAULT_SETTINGS,
  ensureHome,
  readitHome,
  readServerInfo,
  readSettings,
  remoteConfigPath,
  removeServerInfo,
  type ServerInfo,
  serverHost,
  serverInfoPath,
  serverLockPath,
  serverUrl,
  settingsPath,
  sharesPath,
  welcomePath,
  writeServerInfo,
  writeSettings,
} from "./readit-home";

let home: string;
let previousHome: string | undefined;

beforeEach(async () => {
  previousHome = process.env.READIT_HOME;
  home = await fs.mkdtemp(path.join(os.tmpdir(), "readit-home-"));
  process.env.READIT_HOME = home;
});

afterEach(async () => {
  if (previousHome === undefined) {
    delete process.env.READIT_HOME;
  } else {
    process.env.READIT_HOME = previousHome;
  }
  await fs.rm(home, { recursive: true, force: true });
});

describe("paths", () => {
  it("puts every file under the injected home", () => {
    expect(readitHome()).toBe(home);
    expect(commentsDir()).toBe(path.join(home, "comments"));
    expect(settingsPath()).toBe(path.join(home, "settings.json"));
    expect(serverInfoPath()).toBe(path.join(home, "server.json"));
    expect(serverLockPath()).toBe(path.join(home, "server.lock"));
    expect(welcomePath()).toBe(path.join(home, "welcome.md"));
    expect(remoteConfigPath()).toBe(path.join(home, "config.json"));
    expect(sharesPath()).toBe(path.join(home, "shares.json"));
  });

  it("falls back to ~/.readit without an override", () => {
    delete process.env.READIT_HOME;
    expect(readitHome()).toBe(path.join(os.homedir(), ".readit"));
  });

  it("resolves a relative override", () => {
    process.env.READIT_HOME = "relative-home";
    expect(readitHome()).toBe(path.resolve("relative-home"));
  });

  it("creates the home directory", async () => {
    await fs.rm(home, { recursive: true, force: true });
    await ensureHome();
    await expect(fs.stat(home)).resolves.toBeDefined();
  });
});

describe("settings", () => {
  it("returns defaults when the file is missing", async () => {
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips written settings", async () => {
    await writeSettings({
      version: 1,
      fontFamily: FontFamilies.SANS_SERIF,
      onboarded: true,
    });

    await expect(readSettings()).resolves.toEqual({
      version: 1,
      fontFamily: FontFamilies.SANS_SERIF,
      onboarded: true,
    });
  });

  it("leaves no temp file behind", async () => {
    await writeSettings(DEFAULT_SETTINGS);
    await expect(fs.readdir(home)).resolves.toEqual(["settings.json"]);
  });

  it("propagates non-ENOENT read errors", async () => {
    await fs.mkdir(settingsPath(), { recursive: true });
    await expect(readSettings()).rejects.toThrow();
  });
});

describe("server info", () => {
  it("returns undefined when no server is registered", async () => {
    await expect(readServerInfo()).resolves.toBeUndefined();
  });

  it("returns undefined for unparsable content", async () => {
    await ensureHome();
    await fs.writeFile(serverInfoPath(), "not json", "utf-8");
    await expect(readServerInfo()).resolves.toBeUndefined();
  });

  it("round-trips the server.json shape", async () => {
    const info: ServerInfo = { port: 4567, pid: 12345, host: "127.0.0.1" };
    await writeServerInfo(info);
    await expect(readServerInfo()).resolves.toEqual(info);
  });

  it("writes the same shape the Go server writes", async () => {
    await writeServerInfo(serverInfoFixture);
    const written = JSON.parse(await fs.readFile(serverInfoPath(), "utf-8"));
    expect(Object.keys(written).sort()).toEqual(
      Object.keys(serverInfoFixture).sort(),
    );
    expect(written).toEqual(serverInfoFixture);
  });

  it("removes the file and tolerates a missing one", async () => {
    await writeServerInfo({ port: 4567, pid: 1 });
    await removeServerInfo();
    await expect(readServerInfo()).resolves.toBeUndefined();
    await expect(removeServerInfo()).resolves.toBeUndefined();
  });
});

describe("serverHost", () => {
  it("uses the advertised host", () => {
    expect(serverHost({ port: 1, pid: 1, host: "192.168.1.5" })).toBe(
      "192.168.1.5",
    );
  });

  it("dials loopback for a missing or wildcard host", () => {
    expect(serverHost({ port: 1, pid: 1 })).toBe("127.0.0.1");
    expect(serverHost({ port: 1, pid: 1, host: "0.0.0.0" })).toBe("127.0.0.1");
    expect(serverHost({ port: 1, pid: 1, host: "::" })).toBe("127.0.0.1");
  });

  it("builds a base url", () => {
    expect(serverUrl({ port: 4567, pid: 1, host: "0.0.0.0" })).toBe(
      "http://127.0.0.1:4567",
    );
  });
});

describe("canonicalizePath", () => {
  it("resolves symlinks so both servers key a file the same way", async () => {
    const target = path.join(home, "doc.md");
    const link = path.join(home, "link.md");
    await fs.writeFile(target, "# doc", "utf-8");
    await fs.symlink(target, link);

    await expect(canonicalizePath(link)).resolves.toBe(
      await fs.realpath(target),
    );
  });

  it("rejects for a missing file", async () => {
    await expect(
      canonicalizePath(path.join(home, "nope.md")),
    ).rejects.toThrow();
  });
});
