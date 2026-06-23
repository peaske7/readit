export function getCodeBlockText(pre: HTMLPreElement): string {
  return pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
}
