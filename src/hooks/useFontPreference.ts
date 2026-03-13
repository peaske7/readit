import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FontFamilies, type FontFamily } from "../types";

interface UseFontPreferenceResult {
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
  isLoading: boolean;
}

export function useFontPreference(): UseFontPreferenceResult {
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(
    FontFamilies.SERIF,
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const settings = await response.json();
          setFontFamilyState(settings.fontFamily || FontFamilies.SERIF);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const setFontFamily = useCallback(async (font: FontFamily) => {
    setFontFamilyState(font);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontFamily: font }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
    } catch (err) {
      console.error("Failed to save font preference:", err);
      toast.error("Failed to save font preference");
    }
  }, []);

  return {
    fontFamily,
    setFontFamily,
    isLoading,
  };
}
