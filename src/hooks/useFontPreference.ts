import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FontFamilies, type FontFamily } from "../types";

interface UseFontPreferenceResult {
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
  isLoading: boolean;
}

export function useFontPreference(
  filePath: string | null,
): UseFontPreferenceResult {
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(
    FontFamilies.SERIF,
  );
  const [isLoading, setIsLoading] = useState(true);

  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  // Fetch settings when filePath changes
  useEffect(() => {
    if (!filePath) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const fetchSettings = async () => {
      try {
        const query = `?path=${encodeURIComponent(filePath)}`;
        const response = await fetch(`/api/settings${query}`);
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
  }, [filePath]);

  const setFontFamily = useCallback(async (font: FontFamily) => {
    // Optimistic update
    setFontFamilyState(font);

    try {
      const fp = filePathRef.current;
      const query = fp ? `?path=${encodeURIComponent(fp)}` : "";
      const response = await fetch(`/api/settings${query}`, {
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
