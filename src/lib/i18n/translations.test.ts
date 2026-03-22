import { describe, expect, it } from "vitest";
import { createT } from "./translations";
import { Locales } from "./types";

describe("createT", () => {
  it("returns English strings for en locale", () => {
    const t = createT(Locales.EN);
    expect(t("app.loading")).toBe("Loading...");
    expect(t("settings.title")).toBe("Settings");
    expect(t("comment.placeholder")).toBe("Add your comment...");
  });

  it("returns Japanese strings for ja locale", () => {
    const t = createT(Locales.JA);
    expect(t("app.loading")).toBe("読み込み中...");
    expect(t("settings.title")).toBe("設定");
    expect(t("comment.placeholder")).toBe("コメントを入力...");
  });

  it("interpolates {{placeholder}} params", () => {
    const tEn = createT(Locales.EN);
    expect(tEn("commentNav.of", { current: 1, total: 5 })).toBe("1 of 5");

    const tJa = createT(Locales.JA);
    expect(tJa("commentNav.of", { current: 1, total: 5 })).toBe("1 / 5");
  });

  it("interpolates multiple params", () => {
    const t = createT(Locales.EN);
    expect(t("commentManager.deleteAllConfirm", { count: 3 })).toBe(
      "Delete all 3 comments?",
    );
  });

  it("returns string unchanged when no params provided", () => {
    const t = createT(Locales.EN);
    expect(t("app.footer")).toBe("Made with ❤️ by Jay and Claude");
  });
});
