/**
 * lib/import/task-mapping.js
 * Canonical mapping layer: spreadsheet row → Task schema object.
 * Single source of truth for all keyword→field mappings.
 * Used by both the frontend preview and the backend bulk API.
 */

import { findHeader, safeStr, extractUrl, normalizeDate, normHeader, parseClickUpDate } from './normalize.js'

// ─────────────────────────────────────────────────────────────────────────────
// CLICKUP CSV IMPORT — ISOLATED, ONE-TIME IMPORT MODE
// ─────────────────────────────────────────────────────────────────────────────
// Only maps 4 columns: Task Name, Priority, Status, Date Updated.
// Hard-ignores everything else. Priority is always forced to "P2".
// Do NOT modify this to add more columns unless explicitly instructed.
// ─────────────────────────────────────────────────────────────────────────────

const CLICKUP_CSV_STATUS_MAP = {
    'to do': 'To Be Started',
    'in progress': 'In Progress',
    'npl/25pl checking': 'Pending Review',
    'on hold': 'Pending Review',
    'blocked': 'Blocked',
}

const CLICKUP_CSV_PRIORITY_MAP = {
    'urgent': 'P0',
    'high': 'P1',
    'normal': 'P2',
    'none': 'P3',
}

/** The only 4 columns we ever read from a ClickUp CSV export. */
export const CLICKUP_CSV_COLUMNS = {
    title: ['task name'],
    status: ['status'],
    priority: ['priority'],
    dateUpdated: ['date updated'],
}

/**
 * Maps a single ClickUp CSV row → minimal task object.
 * Returns null if Task Name is missing/empty.
 *
 * Output shape (never more keys than these, all other fields
 * are injected by the lifecycle engine defaults):
 *   { client_id, title, status, priority, eta_end }
 */
export function rowToClickUpTask(row, headers, clientId) {
    const h = (field) => findHeader(headers, CLICKUP_CSV_COLUMNS[field])

    // ── Required: Task Name ───────────────────────────────────────────────────
    const titleField = h('title')
    const title = safeStr(row[titleField])
    if (!title) {
        console.debug('[clickup-csv] ⏭  Skipped row — empty Task Name in field:', titleField)
        return null
    }

    const task = {
        client_id: clientId,
        title,
    }

    // ── Priority ──────────────────────────────────────────────────────────────
    const priorityField = h('priority')
    if (priorityField) {
        const raw = safeStr(row[priorityField])
        const mapped = raw ? (CLICKUP_CSV_PRIORITY_MAP[raw.toLowerCase()] ?? 'P2') : 'P2'
        task.priority = mapped
        console.debug(`[clickup-csv] 🚩 priority ← "${priorityField}" = "${raw}" → "${mapped}"`)
    } else {
        task.priority = 'P2'
    }

    // ── Status ────────────────────────────────────────────────────────────────
    const statusField = h('status')
    if (statusField) {
        const raw = safeStr(row[statusField])
        const mapped = raw ? (CLICKUP_CSV_STATUS_MAP[raw.toLowerCase()] ?? 'To Be Started') : 'To Be Started'
        task.status = mapped
        console.debug(`[clickup-csv] 📋 status  ← "${statusField}" = "${raw}" → "${mapped}"`)
    } else {
        task.status = 'To Be Started'
    }

    // ── Date Updated → eta_end (dd/mm/yy) ────────────────────────────────────
    const dateField = h('dateUpdated')
    if (dateField) {
        const raw = row[dateField]
        const parsed = parseClickUpDate(raw)
        console.debug(`[clickup-csv] 📅 eta_end ← "${dateField}" = "${raw}" → "${parsed}"`)
        task.eta_end = parsed // null is fine — lifecycle engine handles missing dates
    }

    console.debug('[clickup-csv] ✅ Row mapped →', JSON.stringify(task))
    return task
}


// ─────────────────────────────────────────────────────────────────────────────
// STATUS MAP
// ─────────────────────────────────────────────────────────────────────────────

const TASK_STATUS_MAP = {
    'implemented/ completed': 'Completed', 'implemented/completed': 'Completed',
    'completed': 'Completed', 'complete': 'Completed', 'done': 'Completed', 'fixed': 'Completed',
    'work in progress': 'In Progress', 'in progress': 'In Progress', 'wip': 'In Progress',
    'to be approved': 'Pending Review', 'pending approval': 'Pending Review',
    'in review': 'Pending Review', 'review': 'Pending Review',
    'blocked': 'Blocked',
    'to be started': 'To Be Started', 'not started': 'To Be Started',
    'pending': 'To Be Started', 'open': 'To Be Started', 'to do': 'To Be Started', 'todo': 'To Be Started',
}

export function mapTaskStatus(s) {
    if (!s) return 'To Be Started'
    return TASK_STATUS_MAP[normHeader(s)] || 'To Be Started'
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL HEADER KEYWORD MAP
// ─────────────────────────────────────────────────────────────────────────────

export const TASK_HEADER_KEYWORDS = {
    title: ['to-do', 'todo', 'task name', 'task title', 'task', 'title', 'name', 'action item', 'action items', 'item', 'description', 'deliverable'],
    status: ['status'],
    category: ['category', 'type', 'group', 'service', 'industry'],
    priority: ['priority'],
    link_url: ['link', 'url', 'live link', 'page url'],
    assigned_to: ['assigned to', 'assigned', 'owner', 'assignee', 'team member'],
    eta_end: ['eta', 'due', 'deadline', 'due date', 'timeline', 'completion date', 'required by', 'required', 'date'],
    remarks: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments', 'detail', 'details', 'feedback'],
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MAPPING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a single spreadsheet row → task object (schema-aligned).
 * Returns null if no title found.
 *
 * @param {Record<string,string>} row     — raw row object
 * @param {string[]}              headers — all headers from parsed sheet
 * @param {string}                clientId — UUID of the target client
 * @returns {Record<string,unknown> | null}
 */
export function rowToTask(row, headers, clientId) {
    const h = (field) => findHeader(headers, TASK_HEADER_KEYWORDS[field])

    // ── Required: title ──────────────────────────────────────────────────────
    const titleField = h('title') || headers[0]
    const title = safeStr(row[titleField])
    if (!title) return null

    const task = { client_id: clientId, title }

    // ── Enum: status ─────────────────────────────────────────────────────────
    const statusCol = h('status')
    if (statusCol) {
        const val = safeStr(row[statusCol])
        if (val) task.status = mapTaskStatus(val)
    }

    // ── String: category ─────────────────────────────────────────────────────
    const catCol = h('category')
    if (catCol) {
        const val = safeStr(row[catCol])
        if (val) task.category = val
    }

    // ── Enum safeguard: priority ─────────────────────────────────────────────
    const priorityCol = h('priority')
    if (priorityCol) {
        const pRaw = safeStr(row[priorityCol])
        if (pRaw && ['P0', 'P1', 'P2', 'P3'].includes(pRaw.toUpperCase())) {
            task.priority = pRaw.toUpperCase()
        }
    }

    // ── URL: link_url ────────────────────────────────────────────────────────
    const linkCol = h('link_url')
    if (linkCol) {
        const url = extractUrl(row[linkCol])
        if (url) task.link_url = url
    }

    // ── String: assigned_to ──────────────────────────────────────────────────
    const assignedCol = h('assigned_to')
    if (assignedCol) {
        const val = safeStr(row[assignedCol])
        if (val) task.assigned_to = val
    }

    // ── Date: eta_end ────────────────────────────────────────────────────────
    const etaCol = h('eta_end')
    if (etaCol) {
        const date = normalizeDate(row[etaCol])
        if (date) task.eta_end = date
    }

    // ── String: remarks ──────────────────────────────────────────────────────
    const remarksCol = h('remarks')
    if (remarksCol) {
        const val = safeStr(row[remarksCol])
        if (val) task.remarks = val
    }

    // ── Unknown header logging ────────────────────────────────────────────────
    const allKnownKeywords = Object.values(TASK_HEADER_KEYWORDS).flat()
    const unknownHeaders = headers.filter(
        hdr => !allKnownKeywords.some(k => normHeader(hdr).includes(k))
    )
    if (unknownHeaders.length > 0 && typeof console !== 'undefined') {
        console.warn('[task-mapping] Unknown/unmapped sheet headers:', unknownHeaders)
    }

    return task
}
