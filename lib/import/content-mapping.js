/**
 * lib/import/content-mapping.js
 *
 * STRICT MINIMAL IMPORT CONTRACT
 * ─────────────────────────────────────────────────────────────────
 * Sheets provide PLANNING METADATA only.
 * Only 4 fields are ever written from a spreadsheet row:
 *   week, blog_title, blog_doc_link, blog_link
 *
 * primary_keyword is recognised so it doesn't appear in the
 * "unrecognised" warning, but is NEVER written to the DB.
 *
 * ALL workflow/lifecycle/status fields are exclusively managed
 * by the lifecycle engine and the dashboard UI.
 * ─────────────────────────────────────────────────────────────────
 */

import { findHeader, safeStr, extractUrl, normHeader } from './normalize.js'

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED IMPORT HEADERS — the ONLY fields we ever write from a sheet
// Keywords are case-insensitive substring matches via normHeader().
// ─────────────────────────────────────────────────────────────────────────────

export const CONTENT_IMPORT_FIELDS = {
    blog_title: [
        'blog title', 'blog name', 'blog topic',
        'title', 'topic', 'name', 'article',
    ],
    week: [
        'week', 'wk',
    ],
    blog_doc_link: [
        'blog doc', 'blog document',
    ],
    blog_link: [
        'blog link', 'live link', 'published link', 'publishing link',
    ],
}

// Columns we recognise but intentionally ignore — so they don't pollute the
// "unrecognised" warning. Their lifecycle is managed by the dashboard UI.
const IGNORED_COLUMNS = [
    'primary keyword', 'primary keywords', 'keyword', 'secondary keyword',
    'writer', 'intern', 'intern name', 'author', 'assigned',
    'blog status', 'intern status', 'status',
    'topic approval', 'topic approval status',
    'internal approval', 'blog internal approval',
    'blog approval', 'blog approval status',
    'client link', 'send link',
    'submission', 'rate', 'rating', 'raw submission',
    'ai score', 'ai',
    'required by', 'date edited', 'date sent', 'date approved',
    'date published', 'published date',
    'content type', 'content goal', 'blog type', 'type', 'goal',
    'feedback', 'comment', 'note', 'remark',
    'secondary keywords',
]

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MAPPING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps one spreadsheet row → a minimal content import object.
 *
 * Output shape (never more keys than these):
 *   { client_id, blog_title, week?, blog_doc_link?, blog_link? }
 *
 * Returns null if blog_title cannot be found.
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

    // ── week ─────────────────────────────────────────────────────────────────
    const weekField = h('week')
    if (weekField) {
        const val = safeStr(row[weekField])
        if (val) item.week = val
        console.debug(`[content-import] 📅 week  ← "${weekField}" = "${val}"`)
    }

    // ── blog_doc_link ────────────────────────────────────────────────────────
    // Covers "Blog Doc", "Outline" (common naming for the draft Google Doc), "Blog"
    const blogDocField = h('blog_doc_link')
    if (blogDocField) {
        const raw = row[blogDocField]
        const url = extractUrl(raw)
        console.debug(`[content-import] 📝 blog_doc_link  ← "${blogDocField}" raw="${raw}" → extracted="${url}"`)
        if (url) item.blog_doc_link = url
        else console.warn(`[content-import] ⚠️  blog_doc_link: could not extract URL from "${raw}"`)
    } else {
        console.debug('[content-import] ℹ️  blog_doc_link: no matching column found in headers —', headers.join(', '))
    }

    // ── blog_link ─────────────────────────────────────────────────────────────
    const blogLinkField = h('blog_link')
    if (blogLinkField) {
        const raw = row[blogLinkField]
        const url = extractUrl(raw)
        console.debug(`[content-import] 🔗 blog_link  ← "${blogLinkField}" raw="${raw}" → extracted="${url}"`)
        if (url) item.blog_link = url
    }

    // ── Header audit ─────────────────────────────────────────────────────────
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
// PREVIEW COLUMNS
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
