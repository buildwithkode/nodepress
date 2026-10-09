import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Turn a snake_cased content-type or field name into a friendly title.
 * e.g. "article_page" → "Article Page".
 */
export function humanizeName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * The label to show for a content type: the human display name the user typed
 * if present, otherwise a Title-Cased version of the snake_case key.
 */
export function ctLabel(ct: { displayName?: string | null; name: string }): string {
  return ct.displayName?.trim() || humanizeName(ct.name)
}

/**
 * Format slug input in real time as user types:
 * - Lowercase all characters
 * - Spaces and underscores convert to hyphens
 * - Removes invalid characters (anything not lowercase letters, numbers, or hyphens)
 * - Collapses consecutive hyphens into a single hyphen
 */
export function formatSlugInput(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

/**
 * Clean slug for final storage or preview (strips leading and trailing hyphens).
 */
export function cleanSlug(str: string): string {
  return formatSlugInput(str).replace(/^-+|-+$/g, '');
}

