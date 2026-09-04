import { describe, expect, it } from "vitest";
import { assertTrustedRemoteUrl } from "./remote";

describe("assertTrustedRemoteUrl", () => {
  it("accepts https remotes", () => {
    expect(() => assertTrustedRemoteUrl("https://md.peas.ke")).not.toThrow();
  });

  it("accepts plain http only on loopback hosts", () => {
    expect(() => assertTrustedRemoteUrl("http://localhost:8787")).not.toThrow();
    expect(() => assertTrustedRemoteUrl("http://127.0.0.1:8787")).not.toThrow();
    expect(() => assertTrustedRemoteUrl("http://[::1]:8787")).not.toThrow();
  });

  it("rejects http to any other host and other schemes", () => {
    expect(() => assertTrustedRemoteUrl("http://md.peas.ke")).toThrow(/https/);
    expect(() => assertTrustedRemoteUrl("ftp://md.peas.ke")).toThrow(/https/);
    expect(() => assertTrustedRemoteUrl("not a url")).toThrow(/valid URL/);
  });
});
