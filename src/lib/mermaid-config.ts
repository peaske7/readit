export const MERMAID_THEME = {
  fontSize: "16px",
  primaryColor: "rgba(245, 222, 160, 0.8)",
  primaryTextColor: "#3f3f46",
  primaryBorderColor: "#c9a84a",
  secondaryColor: "rgba(168, 196, 228, 0.6)",
  secondaryTextColor: "#3f3f46",
  secondaryBorderColor: "#5b7fa8",
  tertiaryColor: "rgba(170, 210, 170, 0.6)",
  tertiaryTextColor: "#3f3f46",
  tertiaryBorderColor: "#5a9a62",
  background: "#ffffff",
  mainBkg: "#ffffff",
  textColor: "#3f3f46",
  lineColor: "#a1a1aa",
  nodeBkg: "rgba(245, 222, 160, 0.6)",
  nodeBorder: "#c9a84a",
  clusterBkg: "rgba(250, 250, 250, 0.8)",
  clusterBorder: "#e4e4e7",
  actorBkg: "rgba(168, 196, 228, 0.5)",
  actorBorder: "#5b7fa8",
  actorTextColor: "#3f3f46",
  signalColor: "#3f3f46",
  signalTextColor: "#3f3f46",
  noteBkgColor: "rgba(245, 222, 160, 0.5)",
  noteBorderColor: "#c9a84a",
  noteTextColor: "#3f3f46",
} as const;

export function getMermaidInitConfig() {
  return {
    startOnLoad: false,
    theme: "base" as const,
    securityLevel: "strict" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    themeVariables: MERMAID_THEME,
  };
}
