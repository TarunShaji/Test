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
 * Month name → zero-padded number (1-indexed).
 */
const MONTH_NAMES = {
    jan: '01', january: '01',
    feb: '02', february: '02',
    mar: '03', march: '03',
    apr: '04', april: '04',
    may: '05',
    jun: '06', june: '06',
    jul: '07', july: '07',
    aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    oct: '10', october: '10',
    nov: '11', november: '11',
    dec: '12', december: '12',
}

/** Expand a 2-digit year to a 4-digit year (pivot: ≥70 → 19xx, <70 → 20xx) */
function expandYear(yy) {
    const n = parseInt(yy, 10)
    if (isNaN(n)) return null
    return n >= 70 ? 1900 + n : 2000 + n
}

/**
 * Normalize any date string into ISO 8601 (YYYY-MM-DD).
 *
 * Supported formats:
 *   - ISO: 2025-03-15, 2025-3-5
 *   - Short ISO: 25-03-15 (yy-mm-dd)
 *   - European/Indian: 15/03/2025, 15-03-2025, 15/03/25
 *   - US: 03/15/2025 (only when day > 12, otherwise treats as dd/mm)
 *   - Named month: "15 Mar 2025", "Mar 15 2025", "March 15, 2025",
 *                  "15th March 2025", "15th Mar, 2025"
 *   - ClickUp-style: "Friday, August 8th 2025, 6:06:11 pm +05:30"
 *   - JS Date fallback for any other parseable string
 *
 * Returns null if the string cannot be parsed into a valid date.
 */
export function normalizeDate(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    if (!s) return null

    // ── 1. Strip ordinal suffixes ("8th" → "8", "1st" → "1") ──────────────
    const stripped = s.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')

    // ── 2. ISO full: YYYY-MM-DD ─────────────────────────────────────────────
    const iso = stripped.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (iso) {
        const [, y, m, d] = iso
        const date = new Date(Date.UTC(+y, +m - 1, +d))
        if (!isNaN(date.getTime())) {
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
        }
    }

    // ── 3. Short ISO: YY-MM-DD ──────────────────────────────────────────────
    const shortIso = stripped.match(/^(\d{2})-(\d{2})-(\d{2})$/)
    if (shortIso) {
        const [, yy, m, d] = shortIso
        const y = expandYear(yy)
        if (y) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    }

    // ── 4. dd/mm/yyyy or dd-mm-yyyy (including 2-digit year) ───────────────
    const dmy = stripped.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
    if (dmy) {
        let [, left, right, yearRaw] = dmy
        const y = yearRaw.length === 2 ? expandYear(yearRaw) : +yearRaw
        if (!y) return null

        let d = +left, m = +right
        // If day > 12, it must be dd/mm. If month > 12, swap to mm/dd.
        // Otherwise default to dd/mm (European/Indian convention).
        if (d > 12 && m <= 12) {
            // dd/mm — already set correctly
        } else if (m > 12 && d <= 12) {
            // Swap: input was mm/dd
            ;[d, m] = [m, d]
        }
        // Both ≤ 12 → default dd/mm
        if (d < 1 || d > 31 || m < 1 || m > 12) return null
        const date = new Date(Date.UTC(y, m - 1, d))
        if (isNaN(date.getTime())) return null
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }

    // ── 5. Named month formats ───────────────────────────────────────────────
    // "15 Mar 2025" / "15 March 2025" / "Mar 15 2025" / "March 15, 2025"
    const namedDM = stripped.match(/^(\d{1,2})\s+([A-Za-z]+)[,\s]+(\d{4})$/)
    if (namedDM) {
        const [, d, monthStr, y] = namedDM
        const m = MONTH_NAMES[monthStr.toLowerCase().slice(0, 9)]
        if (m) {
            const date = new Date(Date.UTC(+y, +m - 1, +d))
            if (!isNaN(date.getTime())) return `${y}-${m}-${String(d).padStart(2, '0')}`
        }
    }
    const namedMD = stripped.match(/^([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})$/)
    if (namedMD) {
        const [, monthStr, d, y] = namedMD
        const m = MONTH_NAMES[monthStr.toLowerCase().slice(0, 9)]
        if (m) {
            const date = new Date(Date.UTC(+y, +m - 1, +d))
            if (!isNaN(date.getTime())) return `${y}-${m}-${String(d).padStart(2, '0')}`
        }
    }

    // ── 6. JS Date constructor fallback (handles ClickUp-style and locale strings) ──
    const fallback = new Date(stripped)
    if (!isNaN(fallback.getTime())) return fallback.toISOString().split('T')[0]

    console.warn('[normalize] normalizeDate: unparseable date string:', JSON.stringify(s))
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
