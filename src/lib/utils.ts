import { type ClassValue, clsx } from "clsx";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import type { DocumentType } from "../types";

export function getFileType(filePath: string): DocumentType | null {
  if (filePath.endsWith(".md") || filePath.endsWith(".markdown")) {
    return "markdown";
  }
  if (filePath.endsWith(".html") || filePath.endsWith(".htm")) {
    return "html";
  }
  return null;
}

export function cn(...inputs: ReadonlyArray<ClassValue>) {
  return twMerge(clsx(inputs));
}

/**
 * Truncate text with ellipsis for toast notifications.
 */
export function truncate(text: string, maxLength = 30): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/**
 * Recursively extract text content from React children.
 * Handles strings, numbers, arrays, and React elements.
 */
export function getTextContent(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") {
    return String(children);
  }
  if (Array.isArray(children)) {
    return children.map(getTextContent).join("");
  }
  if (
    typeof children === "object" &&
    children !== null &&
    "props" in children
  ) {
    return getTextContent(
      (children as { props: { children?: ReactNode } }).props.children,
    );
  }
  return "";
}

/**
 * Slugify text to create URL-friendly IDs
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
