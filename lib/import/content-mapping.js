/**
 * lib/import/content-mapping.js
 *
 * CONTENT CALENDAR IMPORT CONTRACT
 * ─────────────────────────────────────────────────────────────────
 * Planning fields imported (if present):
 *   blog_title (required), week, primary_keyword, secondary_keywords,
 *   writer, search_volume, outline_link, required_by
 *   blog_doc_link, blog_link, published_date
 *
 * Workflow fields — imported with safety guards:
 *   topic_approval_status  → defaults to 'Pending' if unrecognised
 *   blog_status            → defaults to 'Draft' if unrecognised
 *   blog_internal_approval → auto-demoted to 'Pending' if no blog_doc_link
 *                            or topic not Approved
 *   intern_status          → defaults to null if unrecognised
 *
 * Fields NEVER imported (client-managed / lifecycle-only):
 *   blog_approval_status, blog_approval_date, client_link_visible_blog,
 *   blog_client_feedback_note, date_sent_for_approval
 * ─────────────────────────────────────────────────────────────────
 */

import { findHeader, safeStr, extractUrl, normHeader, normalizeDate } from './normalize.js'

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED IMPORT HEADERS
// ─────────────────────────────────────────────────────────────────────────────

export const CONTENT_IMPORT_FIELDS = {
    // ── Required ──────────────────────────────────────────────────────────────
    blog_title: ['blog title', 'blog name', 'blog topic', 'title', 'topic'],

    // ── Metadata ──────────────────────────────────────────────────────────────
    week: ['week', 'wk'],
    primary_keyword: ['primary keyword', 'primary keywords'],
    secondary_keywords: ['secondary keyword', 'secondary keywords'],
    writer: ['writer', 'author'],
    search_volume: ['search volume'],

    // ── Workflow Statuses ──────────────────────────────────────────────────────
    topic_approval_status: ['topic approval', 'topic approval status', 'topic status'],
    blog_status: ['blog status'],
    blog_internal_approval: ['internal approval', 'blog internal approval'],
    intern_status: ['intern status'],

    // ── Links ─────────────────────────────────────────────────────────────────
    outline_link: ['outline', 'outlines'],
    blog_doc_link: ['blog doc', 'blog document'],   // NOTE: bare 'blog' removed — too broad, causes false matches
    blog_link: ['blog link', 'live link', 'published link', 'publishing link'],

    // ── Dates ─────────────────────────────────────────────────────────────────
    required_by: ['blogs required by', 'blog required by', 'required by', 'blogs required'],
    published_date: ['published date', 'published', 'date of publication', 'publication date'],
}

// Columns recognised but not imported (prevents "unrecognised" warnings)
const IGNORED_COLUMNS = [
    'blog approval', 'blog approval status',
    'client link', 'send link',
    'date sent', 'date sent for approval', 'sent for approval',
    'approved by client', 'approved on', 'client approved on',
    'submission', 'rate', 'rating', 'raw submission', 'ai score', 'ai',
    'required by date', 'date edited', 'date approved',
    'feedback', 'comment', 'note', 'remark',
    'intern', 'intern name', 'assigned',
    'content type', 'content goal', 'blog type', 'type', 'goal',
    'outline status',
]

// ─────────────────────────────────────────────────────────────────────────────
// ENUM NORMALIZERS
// ─────────────────────────────────────────────────────────────────────────────

const TOPIC_APPROVAL_MAP = {
    'pending': 'Pending', 'approved': 'Approved', 'approve': 'Approved',
    'yes': 'Approved', 'done': 'Approved',
    'rejected': 'Rejected', 'reject': 'Rejected', 'no': 'Rejected',
}

const BLOG_STATUS_MAP = {
    'draft': 'Draft',
    'in progress': 'In Progress', 'wip': 'In Progress', 'writing': 'In Progress',
    'sent for approval': 'Sent for Approval', 'sent': 'Sent for Approval', 'submitted': 'Sent for Approval',
    'published': 'Published', 'live': 'Published',
    'rejected': 'Rejected',
}

const BLOG_INTERNAL_APPROVAL_MAP = {
    'pending': 'Pending', 'approved': 'Approved', 'approve': 'Approved',
    'done': 'Approved', 'yes': 'Approved',
}

const INTERN_STATUS_MAP = {
    'assigned': 'Assigned',
    'making outlines': 'Making Outlines', 'outlines': 'Making Outlines', 'outlining': 'Making Outlines',
    'submitted': 'Submitted', 'submit': 'Submitted',
    'rejected': 'Rejected', 'reject': 'Rejected',
    'rework': 'Rework', 'revision': 'Rework', 'redo': 'Rework',
}

function mapTopicApproval(raw) {
    if (!raw) return null
    return TOPIC_APPROVAL_MAP[normHeader(raw)] ?? null
}
function mapBlogStatus(raw) {
    if (!raw) return null
    return BLOG_STATUS_MAP[normHeader(raw)] ?? null
}
function mapBlogInternalApproval(raw) {
    if (!raw) return null
    return BLOG_INTERNAL_APPROVAL_MAP[normHeader(raw)] ?? null
}
function mapInternStatus(raw) {
    if (!raw) return null
    return INTERN_STATUS_MAP[normHeader(raw)] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// VALUE PARSERS
// ─────────────────────────────────────────────────────────────────────────────

/** Parse week: "1", "Week 3", "W7". Clamps to 1-52. */
function parseWeek(raw) {
    if (!raw) return null
    const match = String(raw).match(/\d+/)
    if (!match) return null
    const n = parseInt(match[0], 10)
    if (isNaN(n) || n < 1 || n > 52) return null
    return String(n)
}

/** Parse an integer (e.g. search volume). Returns null if not a positive integer. */
function parseIntPositive(raw) {
    if (raw === null || raw === undefined || raw === '') return null
    const n = parseInt(String(raw).replace(/,/g, ''), 10)
    if (isNaN(n) || n < 0) return null
    return n
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MAPPING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps one spreadsheet row → content import object.
 * Returns null ONLY if blog_title cannot be resolved.
 */
export function rowToContent(row, headers, clientId) {
    const h = (field) => findHeader(headers, CONTENT_IMPORT_FIELDS[field])

    // ── Required: blog_title ─────────────────────────────────────────────────
    let titleField = h('blog_title')
    const blogDocField = h('blog_doc_link')

    // Safety: "blog" keyword might steal the title field — don't use it if it's the doc field too
    if (titleField && titleField === blogDocField && normHeader(titleField) === 'blog') {
        titleField = headers.find(hdr => hdr !== blogDocField) || headers[0]
    } else if (!titleField) {
        titleField = headers[0]
    }

    const blog_title = safeStr(row[titleField])
    if (!blog_title) {
        console.debug('[content-import] ⏭  Skipped row — no blog_title in:', titleField)
        return null
    }

    const item = { client_id: clientId, blog_title }

    // ── week ─────────────────────────────────────────────────────────────────
    const weekField = h('week')
    if (weekField) {
        const val = parseWeek(row[weekField])
        if (val !== null) item.week = val
        else if (row[weekField]) console.warn(`[content-import] ⚠️  week: could not parse "${row[weekField]}"`)
    }

    // ── primary_keyword ──────────────────────────────────────────────────────
    const kwField = h('primary_keyword')
    if (kwField) { const v = safeStr(row[kwField]); if (v) item.primary_keyword = v }

    // ── secondary_keywords ───────────────────────────────────────────────────
    const secKwField = h('secondary_keywords')
    if (secKwField) { const v = safeStr(row[secKwField]); if (v) item.secondary_keywords = v }

    // ── writer ────────────────────────────────────────────────────────────────
    const writerField = h('writer')
    if (writerField) { const v = safeStr(row[writerField]); if (v) item.writer = v }

    // ── search_volume ─────────────────────────────────────────────────────────
    const svField = h('search_volume')
    if (svField) {
        const v = parseIntPositive(row[svField])
        if (v !== null) item.search_volume = v
        else if (row[svField]) console.warn(`[content-import] ⚠️  search_volume: invalid value "${row[svField]}"`)
    }

    // ── outline_link (Google Doc for the outline) — extract URL from anchor ──
    const outlineField = h('outline_link')
    if (outlineField) {
        const raw = row[outlineField]
        const url = extractUrl(raw)
        if (url) {
            item.outline_link = url
            console.debug(`[content-import] 📋 outline_link ← "${outlineField}" → "${url}"`)
        } else if (raw) {
            console.warn(`[content-import] ⚠️  outline_link: no URL extractable from "${raw}"`)
        }
    }

    // ── blog_doc_link — extract URL (handles anchor text + hyperlink) ─────────
    if (blogDocField) {
        const raw = row[blogDocField]
        const url = extractUrl(raw)
        if (url) item.blog_doc_link = url
        else if (raw) console.warn(`[content-import] ⚠️  blog_doc_link: no URL from "${raw}"`)
    }

    // ── blog_link ─────────────────────────────────────────────────────────────
    const blogLinkField = h('blog_link')
    if (blogLinkField) {
        const raw = row[blogLinkField]
        const url = extractUrl(raw)
        if (url) item.blog_link = url
    }

    // ── required_by (YYYY-MM-DD) ───────────────────────────────────────────────
    const reqByField = h('required_by')
    if (reqByField) {
        const raw = row[reqByField]
        const date = normalizeDate(raw)
        if (date) item.required_by = date
        else if (raw) console.warn(`[content-import] ⚠️  required_by: could not parse date "${raw}"`)
    }

    // ── published_date (YYYY-MM-DD) ───────────────────────────────────────────
    const publishedField = h('published_date')
    if (publishedField) {
        const raw = row[publishedField]
        const date = normalizeDate(raw)
        if (date) item.published_date = date
        else if (raw) console.warn(`[content-import] ⚠️  published_date: could not parse date "${raw}"`)
    }

    // ── WORKFLOW STATUSES ─────────────────────────────────────────────────────

    // topic_approval_status
    const topicField = h('topic_approval_status')
    if (topicField) {
        const mapped = mapTopicApproval(row[topicField])
        if (mapped) {
            item.topic_approval_status = mapped
        } else if (row[topicField]) {
            console.warn(`[content-import] ⚠️  topic_approval_status: unrecognised "${row[topicField]}"`)
        }
    }

    // blog_status
    const blogStatusField = h('blog_status')
    if (blogStatusField) {
        const mapped = mapBlogStatus(row[blogStatusField])
        if (mapped) {
            item.blog_status = mapped
        } else if (row[blogStatusField]) {
            console.warn(`[content-import] ⚠️  blog_status: unrecognised "${row[blogStatusField]}"`)
        }
    }

    // blog_internal_approval — guards: needs blog_doc_link AND topic Approved
    const internalField = h('blog_internal_approval')
    if (internalField) {
        const mapped = mapBlogInternalApproval(row[internalField])
        if (mapped === 'Approved') {
            if (!item.blog_doc_link) {
                console.warn(`[content-import] 🛡️  blog_internal_approval: demoting to Pending — no blog_doc_link`)
                item.blog_internal_approval = 'Pending'
            } else if (item.topic_approval_status && item.topic_approval_status !== 'Approved') {
                console.warn(`[content-import] 🛡️  blog_internal_approval: demoting to Pending — topic not Approved`)
                item.blog_internal_approval = 'Pending'
            } else {
                item.blog_internal_approval = 'Approved'
            }
        } else if (mapped) {
            item.blog_internal_approval = mapped
        } else if (row[internalField]) {
            console.warn(`[content-import] ⚠️  blog_internal_approval: unrecognised "${row[internalField]}"`)
        }
    }

    // intern_status
    const internField = h('intern_status')
    if (internField) {
        const mapped = mapInternStatus(row[internField])
        if (mapped) {
            item.intern_status = mapped
        } else if (row[internField]) {
            console.warn(`[content-import] ⚠️  intern_status: unrecognised "${row[internField]}"`)
        }
    }

    console.debug('[content-import] ✅ Row →', JSON.stringify(item))
    return item
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export function getMappedHeaders(headers) {
    const supportedKeywords = Object.values(CONTENT_IMPORT_FIELDS).flat()
    return headers.filter(h => supportedKeywords.some(k => normHeader(h).includes(k)))
}
