/**
 * lib/import/normalize.js
 * Shared normalization utilities for the import pipeline.
 * Works on both client (browser) and server (Node.js) — no framework deps.
 */

// ─────────────────────────────────────────────────────────────────────────────
// HEADER UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize a column header: lowercase, collapse dashes/underscores/spaces */
export const normHeader = (s) =>
    String(s || '').toLowerCase().replace(/[-_\s]+/g, ' ').trim()

/** Find the first matching header from a list of keyword patterns (substring match) */
export const findHeader = (headers, keywords) =>
    headers.find(h => keywords.some(k => normHeader(h).includes(k))) || null

// ─────────────────────────────────────────────────────────────────────────────
// STRING UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

/** Trim a value and return null if empty */
export const safeStr = (v) => {
    const s = String(v === null || v === undefined ? '' : v).trim()
    return s || null
}

// ─────────────────────────────────────────────────────────────────────────────
// URL NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a raw URL string:
 * - Prepends https:// if protocol is missing.
 * - Returns null if input is empty or clearly not a URL.
 */
export function normalizeUrl(raw) {
    if (!raw) return null
    const trimmed = String(raw).trim()
    if (!trimmed) return null

    // Already absolute
    if (/^https?:\/\//i.test(trimmed)) return trimmed

    // Starts with www. — safe to prepend
    if (/^www\./i.test(trimmed)) return `https://${trimmed}`

    // Looks like a domain (has a dot and TLD)
    if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`

    return null // Not a recognizable URL shape
}

/**
 * Extract the first URL from a string.
 * Handles:  plain URLs, "Anchor Text (https://...)" format, www. domains.
 *
 * This is the canonical URL extractor for all import sources.
 */
export function extractUrl(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null

    // 1. Already looks like a full URL
    if (/^https?:\/\//i.test(s)) {
        const url = s.split(/[\s'"<>)]/)[0]  // Take until whitespace/quote
        return normalizeUrl(url)
    }

    // 2. Find embedded http(s):// URL within the string
    const httpMatch = s.match(/https?:\/\/[^\s'"<>)]+/)
    if (httpMatch) return normalizeUrl(httpMatch[0])

    // 3. Try normalizing the entire string as a URL
    return normalizeUrl(s)
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE NORMALIZATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize any date string into ISO 8601 (YYYY-MM-DD).
 * Supports: dd/mm/yyyy, mm/dd/yyyy, dd-mm-yyyy, yyyy-mm-dd,
 *           "1 Mar 2025", "March 1 2025", and JS Date fallback.
 */
export function normalizeDate(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null

    // Already ISO
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (iso) {
        const [, y, m, d] = iso
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    // dd/mm/yyyy or dd-mm-yyyy (European / Indian format)
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
    if (dmy) {
        const [, d, m, y] = dmy
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    // mm/dd/yyyy (US format) — only used if day > 12 makes dd/mm ambiguous
    // We default to dd/mm above, so if you need US format, add separate input validation

    // Named month: "1 Mar 2025" / "Mar 1, 2025" / "1 March 2025"
    const named = s.match(/^(\d{1,2})\s+([A-Za-z]+)[\s,]+(\d{4})$/) ||
        s.match(/^([A-Za-z]+)\s+(\d{1,2})[\s,]+(\d{4})$/)
    if (named) {
        const date = new Date(s)
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0]
    }

    // Fallback: JS Date constructor
    const fallback = new Date(s)
    if (!isNaN(fallback.getTime())) return fallback.toISOString().split('T')[0]

    return null
}

// ─────────────────────────────────────────────────────────────────────────────
// CLICKUP DATE PARSER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a ClickUp "Date Updated" string into dd/mm/yy format.
 *
 * ClickUp format examples:
 *   "Friday, August 8th 2025, 6:06:11 pm +05:30"
 *   "Monday, January 1st 2025, 12:00:00 am +00:00"
 *
 * Output: "08/08/25"  (dd/mm/yy)
 * Returns null if the string cannot be parsed.
 */
export function parseClickUpDate(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null

    // Strip ordinal suffixes: "8th" → "8", "1st" → "1", "22nd" → "22", "3rd" → "3"
    const cleaned = s.replace(/(\d+)(st|nd|rd|th)/gi, '$1')

    // Attempt JS Date parse on the cleaned string.
    // Works well for: "Friday, August 8 2025, 6:06:11 pm +05:30"
    const d = new Date(cleaned)
    if (isNaN(d.getTime())) {
        console.warn('[normalize] parseClickUpDate: could not parse', JSON.stringify(raw))
        return null
    }

    // Format as dd/mm/yy using UTC to avoid timezone shifting
    const day = String(d.getUTCDate()).padStart(2, '0')
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const year = String(d.getUTCFullYear()).slice(-2)

    return `${day}/${month}/${year}`
}
