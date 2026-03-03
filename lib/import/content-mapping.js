/**
 * lib/import/content-mapping.js
 *
 * CONTENT CALENDAR IMPORT CONTRACT
 * ─────────────────────────────────────────────────────────────────
 * Sheets provide PLANNING METADATA only.
 * Fields written from a spreadsheet row:
 *   blog_title (required), week, primary_keyword, writer,
 *   blog_doc_link, blog_link, published_date
 *
 * ALL workflow/lifecycle/status fields stay exclusively managed
 * by the lifecycle engine and the dashboard UI:
 *   topic_approval_status, blog_status, blog_internal_approval,
 *   blog_approval_status, client_link_visible_blog,
 *   blog_client_feedback_note
 * ─────────────────────────────────────────────────────────────────
 */

import { findHeader, safeStr, extractUrl, normHeader, normalizeDate } from './normalize.js'

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED IMPORT HEADERS — the ONLY fields we ever write from a sheet
// Keywords are case-insensitive substring matches via normHeader().
// ─────────────────────────────────────────────────────────────────────────────

export const CONTENT_IMPORT_FIELDS = {
    // ── Required ──────────────────────────────────────────────────────────────
    blog_title: [
        'blog title', 'blog name', 'blog topic',
        'title', 'topic',
        // NOTE: 'name' and 'article' intentionally omitted — too broad,
        // causes false matches on "Intern Name", "File Name", etc.
    ],

    // ── Metadata ──────────────────────────────────────────────────────────────
    week: [
        'week', 'wk',
    ],
    primary_keyword: [
        'primary keyword', 'primary keywords', 'keyword', 'keywords',
    ],
    writer: [
        'writer', 'author',
    ],

    // ── Links ─────────────────────────────────────────────────────────────────
    blog_doc_link: [
        'blog doc', 'blog document',
    ],
    blog_link: [
        'blog link', 'link', 'live link', 'published link', 'publishing link',
    ],

    // ── Dates ─────────────────────────────────────────────────────────────────
    published_date: [
        'published date', 'published', 'date of publication', 'publication date',
    ],
}

// Columns we recognise but intentionally do NOT import.
// Listed here so they don't pollute the "unrecognised" warning.
// Their lifecycle is managed exclusively by the dashboard UI.
const IGNORED_COLUMNS = [
    // Workflow / status (UI managed)
    'blog status', 'intern status', 'status',
    'topic approval', 'topic approval status',
    'internal approval', 'blog internal approval',
    'blog approval', 'blog approval status',
    'client link', 'send link',
    // Quality metrics (not in import schema)
    'submission', 'rate', 'rating', 'raw submission',
    'ai score', 'ai',
    // Dates managed by UI
    'required by', 'date edited', 'date sent', 'date approved',
    // Secondary / extra keywords
    'secondary keyword', 'secondary keywords',
    // Community / feedback
    'feedback', 'comment', 'note', 'remark',
    // Legacy naming variants
    'intern', 'intern name', 'assigned',
    'content type', 'content goal', 'blog type', 'type', 'goal',
]

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a week value: accepts "1", "Week 3", "W7", etc.
 * Clamps to 1–10. Returns the string representation (e.g. "3") or null.
 */
function parseWeek(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    // Extract the first integer found in the string
    const match = s.match(/\d+/)
    if (!match) return null
    const n = parseInt(match[0], 10)
    if (isNaN(n) || n < 1 || n > 10) return null
    return String(n)
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MAPPING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps one spreadsheet row → a content import object.
 *
 * Output shape (never more keys than these):
 *   {
 *     client_id, blog_title,
 *     week?,           — integer 1-10 stored as string, or omitted
 *     primary_keyword?, writer?,
 *     blog_doc_link?,  blog_link?,
 *     published_date?, — ISO YYYY-MM-DD
 *   }
 *
 * Returns null ONLY if blog_title cannot be resolved.
 */
export function rowToContent(row, headers, clientId) {
    const h = (field) => findHeader(headers, CONTENT_IMPORT_FIELDS[field])

    // ── Required: blog_title ─────────────────────────────────────────────────
    const titleField = h('blog_title') || headers[0]
    const blog_title = safeStr(row[titleField])
    if (!blog_title) {
        console.debug('[content-import] ⏭  Skipped row — no blog_title found in field:', titleField)
        return null
    }

    const item = { client_id: clientId, blog_title }

    // ── week (1-10, stored as string number) ─────────────────────────────────
    const weekField = h('week')
    if (weekField) {
        const val = parseWeek(row[weekField])
        if (val !== null) {
            item.week = val
            console.debug(`[content-import] 📅 week  ← "${weekField}" = "${row[weekField]}" → "${val}"`)
        } else if (row[weekField]) {
            console.warn(`[content-import] ⚠️  week: could not parse week from "${row[weekField]}" (must be 1-10)`)
        }
    }

    // ── primary_keyword ──────────────────────────────────────────────────────
    const kwField = h('primary_keyword')
    if (kwField) {
        const val = safeStr(row[kwField])
        if (val) {
            item.primary_keyword = val
            console.debug(`[content-import] 🔍 primary_keyword ← "${kwField}" = "${val}"`)
        }
    }

    // ── writer ────────────────────────────────────────────────────────────────
    const writerField = h('writer')
    if (writerField) {
        const val = safeStr(row[writerField])
        if (val) {
            item.writer = val
            console.debug(`[content-import] ✍️  writer ← "${writerField}" = "${val}"`)
        }
    }

    // ── blog_doc_link ─────────────────────────────────────────────────────────
    const blogDocField = h('blog_doc_link')
    if (blogDocField) {
        const raw = row[blogDocField]
        const url = extractUrl(raw)
        console.debug(`[content-import] 📝 blog_doc_link ← "${blogDocField}" raw="${raw}" → extracted="${url}"`)
        if (url) item.blog_doc_link = url
        else if (raw) console.warn(`[content-import] ⚠️  blog_doc_link: could not extract URL from "${raw}"`)
    } else {
        console.debug('[content-import] ℹ️  blog_doc_link: no matching column found in headers —', headers.join(', '))
    }

    // ── blog_link ─────────────────────────────────────────────────────────────
    const blogLinkField = h('blog_link')
    if (blogLinkField) {
        const raw = row[blogLinkField]
        const url = extractUrl(raw)
        console.debug(`[content-import] 🔗 blog_link ← "${blogLinkField}" raw="${raw}" → extracted="${url}"`)
        if (url) item.blog_link = url
    }

    // ── published_date (ISO YYYY-MM-DD) ───────────────────────────────────────
    const publishedField = h('published_date')
    if (publishedField) {
        const raw = row[publishedField]
        const date = normalizeDate(raw)
        if (date) {
            item.published_date = date
            console.debug(`[content-import] 📆 published_date ← "${publishedField}" = "${raw}" → "${date}"`)
        } else if (raw) {
            console.warn(`[content-import] ⚠️  published_date: could not parse date from "${raw}"`)
        }
    }

    // ── Header audit ──────────────────────────────────────────────────────────
    const supportedKeywords = Object.values(CONTENT_IMPORT_FIELDS).flat()

    const ignoredHeaders = headers.filter(
        hdr => !supportedKeywords.some(k => normHeader(hdr).includes(k)) &&
            IGNORED_COLUMNS.some(k => normHeader(hdr).includes(k))
    )
    const unknownHeaders = headers.filter(
        hdr => !supportedKeywords.some(k => normHeader(hdr).includes(k)) &&
            !IGNORED_COLUMNS.some(k => normHeader(hdr).includes(k))
    )

    if (ignoredHeaders.length > 0)
        console.debug('[content-import] 🚫 Ignored (workflow-managed, not imported):', ignoredHeaders)
    if (unknownHeaders.length > 0)
        console.warn('[content-import] ❓ Unrecognised columns (not imported):', unknownHeaders)

    console.debug('[content-import] ✅ Row mapped →', JSON.stringify(item))
    return item
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW HELPERS
// Returns only the headers that match a supported import field,
// so the preview table matches what will actually be persisted.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter raw sheet headers down to only those that will be imported.
 * Used by the preview table so it only shows relevant columns.
 */
export function getMappedHeaders(headers) {
    const supportedKeywords = Object.values(CONTENT_IMPORT_FIELDS).flat()
    return headers.filter(h =>
        supportedKeywords.some(k => normHeader(h).includes(k))
    )
}
