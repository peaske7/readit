import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { type EditorScheme, EditorSchemes } from "../types";

interface UseEditorSchemeResult {
  editorScheme: EditorScheme;
  setEditorScheme: (scheme: EditorScheme) => Promise<void>;
}

export function useEditorScheme(): UseEditorSchemeResult {
  const [editorScheme, setEditorSchemeState] = useState<EditorScheme>(
    EditorSchemes.NONE,
  );

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const settings = await response.json();
          setEditorSchemeState(settings.editorScheme || EditorSchemes.NONE);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    };

    fetchSettings();
  }, []);

  const setEditorScheme = useCallback(async (scheme: EditorScheme) => {
    setEditorSchemeState(scheme);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editorScheme: scheme }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
    } catch (err) {
      console.error("Failed to save editor scheme:", err);
      toast.error("Failed to save editor scheme");
    }
  }, []);

  return { editorScheme, setEditorScheme };
}
