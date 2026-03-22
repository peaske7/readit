import { describe, expect, it } from "vitest";
import { en } from "./en";
import { ja } from "./ja";

describe("translation completeness", () => {
  const enKeys = Object.keys(en).sort();
  const jaKeys = Object.keys(ja).sort();

  it("en and ja have the same keys", () => {
    expect(enKeys).toEqual(jaKeys);
  });

  // Prefix/suffix keys may be intentionally empty in some locales
  // (e.g., Japanese has no prefix before the command)
  const ALLOW_EMPTY = new Set(["app.noDocumentsHintPrefix"]);

  it("no empty string values in en", () => {
    for (const [key, value] of Object.entries(en)) {
      if (ALLOW_EMPTY.has(key)) continue;
      expect(value, `en.${key} is empty`).not.toBe("");
    }
  });

  it("no empty string values in ja", () => {
    for (const [key, value] of Object.entries(ja)) {
      if (ALLOW_EMPTY.has(key)) continue;
      expect(value, `ja.${key} is empty`).not.toBe("");
    }
  });

  it("interpolation placeholders match between locales", () => {
    const placeholderPattern = /\{\{(\w+)\}\}/g;

    for (const key of enKeys) {
      const enValue = en[key as keyof typeof en];
      const jaValue = ja[key as keyof typeof ja];

      const enPlaceholders = [...enValue.matchAll(placeholderPattern)]
        .map((m) => m[1])
        .sort();
      const jaPlaceholders = [...jaValue.matchAll(placeholderPattern)]
        .map((m) => m[1])
        .sort();

      expect(
        enPlaceholders,
        `Placeholder mismatch for key "${key}": en has ${JSON.stringify(enPlaceholders)}, ja has ${JSON.stringify(jaPlaceholders)}`,
      ).toEqual(jaPlaceholders);
    }
  });
});
