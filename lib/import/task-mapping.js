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
// STATUS MAP  (case-insensitive via normHeader)
// ─────────────────────────────────────────────────────────────────────────────

const TASK_STATUS_MAP = {
    // Completed
    'implemented/ completed': 'Completed', 'implemented/completed': 'Completed',
    'completed': 'Completed', 'complete': 'Completed', 'done': 'Completed', 'fixed': 'Completed',
    // In Progress
    'work in progress': 'In Progress', 'in progress': 'In Progress', 'wip': 'In Progress',
    // Pending Review
    'to be approved': 'Pending Review', 'pending approval': 'Pending Review',
    'in review': 'Pending Review', 'review': 'Pending Review', 'pending review': 'Pending Review',
    // Blocked
    'blocked': 'Blocked',
    // To Be Started (default)
    'to be started': 'To Be Started', 'not started': 'To Be Started',
    'pending': 'To Be Started', 'open': 'To Be Started', 'to do': 'To Be Started', 'todo': 'To Be Started',
    'new': 'To Be Started',
}

/**
 * Normalize a raw status string → schema enum value.
 * Case-insensitive. Defaults to 'To Be Started'.
 */
export function mapTaskStatus(s) {
    if (!s) return 'To Be Started'
    return TASK_STATUS_MAP[normHeader(s)] || 'To Be Started'
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY MAP  (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────

const TASK_PRIORITY_MAP = {
    'p0': 'P0', 'urgent': 'P0', 'critical': 'P0',
    'p1': 'P1', 'high': 'P1',
    'p2': 'P2', 'normal': 'P2', 'medium': 'P2', 'mid': 'P2',
    'p3': 'P3', 'low': 'P3', 'none': 'P3',
}

/**
 * Normalize a raw priority string → P0/P1/P2/P3.
 * Defaults to 'P2' if blank or unrecognised.
 */
export function mapTaskPriority(s) {
    if (!s) return 'P2'
    return TASK_PRIORITY_MAP[normHeader(s)] || 'P2'
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL HEADER KEYWORD MAP
// ─────────────────────────────────────────────────────────────────────────────

export const TASK_HEADER_KEYWORDS = {
    // Required
    title: ['to-do', 'todo', 'task name', 'task title', 'task', 'title', 'name', 'action item', 'action items', 'item', 'description', 'deliverable'],
    // Optional mapped
    status: ['status'],
    category: ['category', 'type', 'group', 'service', 'industry'],
    priority: ['priority'],
    eta_end: ['eta', 'eta end', 'eta date', 'due', 'due date', 'deadline', 'timeline', 'completion date', 'required by', 'required', 'target date', 'expected'],
    link_url: ['link', 'url', 'live link', 'page url'],
    // Recognised-but-not-imported (kept here so they don't appear in "unknown" warnings)
    // assigned_to is user-selectable only — NOT mapped from spreadsheet
    _ignored_assigned: ['assigned to', 'assigned', 'owner', 'assignee', 'team member'],
    _ignored_remarks: ['remarks', 'notes', 'comments', 'note', 'comment'],
    _ignored_approval: ['internal approval', 'send link', 'client approval', 'client feedback'],
}

/** Canonical columns for the Tasks import preview table */
export const TASK_PREVIEW_COLS = [
    { field: 'title', label: 'Task' },
    { field: 'category', label: 'Category' },
    { field: 'status', label: 'Status' },
    { field: 'priority', label: 'Priority' },
    { field: 'eta_end', label: 'ETA End' },
    { field: 'link_url', label: 'Link' },
    // assigned_to intentionally omitted — user selects via UI
    { field: 'internal_approval', label: 'Internal Approval' },
    { field: 'client_link_visible', label: 'Send Link' },
    { field: 'client_approval', label: 'Client Approval' },
    { field: 'client_feedback_note', label: 'Client Feedback' },
]

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MAPPING FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a single spreadsheet row → task object (schema-aligned).
 * Returns null ONLY if no title field can be found.
 *
 * NOTE: assigned_to is intentionally NOT mapped — it must be selected
 *       by the user through the dashboard UI using the team member picker.
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
    if (!title) {
        console.debug('[task-mapping] ⏭  Skipped row — no task title found in field:', titleField)
        return null
    }

    const task = { client_id: clientId, title }

    // ── Enum: status (case-insensitive) ──────────────────────────────────────
    const statusCol = h('status')
    if (statusCol) {
        const val = safeStr(row[statusCol])
        if (val) {
            task.status = mapTaskStatus(val)
            console.debug(`[task-mapping] 📋 status  ← "${statusCol}" = "${val}" → "${task.status}"`)
        }
    }

    // ── String: category (plain text, stored as-is) ───────────────────────────
    const catCol = h('category')
    if (catCol) {
        const val = safeStr(row[catCol])
        if (val) {
            task.category = val
            console.debug(`[task-mapping] 🏷️  category ← "${catCol}" = "${val}"`)
        }
    }

    // ── Enum safeguard: priority → P0/P1/P2/P3, default P2 ──────────────────
    const priorityCol = h('priority')
    if (priorityCol) {
        const pRaw = safeStr(row[priorityCol])
        task.priority = mapTaskPriority(pRaw)
        console.debug(`[task-mapping] 🚩 priority ← "${priorityCol}" = "${pRaw}" → "${task.priority}"`)
    } else {
        task.priority = 'P2'
    }

    // ── URL: link_url ────────────────────────────────────────────────────────
    const linkCol = h('link_url')
    if (linkCol) {
        const url = extractUrl(row[linkCol])
        if (url) {
            task.link_url = url
            console.debug(`[task-mapping] 🔗 link_url ← "${linkCol}" → "${url}"`)
        }
    }

    // ── Date: eta_end (robust normalisation) ──────────────────────────────────
    const etaCol = h('eta_end')
    if (etaCol) {
        const date = normalizeDate(row[etaCol])
        if (date) {
            task.eta_end = date
            console.debug(`[task-mapping] 📅 eta_end  ← "${etaCol}" = "${row[etaCol]}" → "${date}"`)
        } else if (row[etaCol]) {
            console.warn(`[task-mapping] ⚠️  eta_end: could not parse date from "${row[etaCol]}"`)
        }
    }

    // ── Header audit ─────────────────────────────────────────────────────────
    const allKnownKeywords = Object.values(TASK_HEADER_KEYWORDS).flat()
    const unknownHeaders = headers.filter(
        hdr => !allKnownKeywords.some(k => normHeader(hdr).includes(k))
    )
    if (unknownHeaders.length > 0) {
        console.warn('[task-mapping] ❓ Unrecognised sheet headers (not imported):', unknownHeaders)
    }

    // ── Lifecycle defaults (for preview and DB consistency) ───────────────────
    task.internal_approval = task.internal_approval || 'Pending'
    task.client_link_visible = task.client_link_visible !== undefined ? task.client_link_visible : false
    task.client_approval = task.client_approval || null
    task.client_feedback_note = task.client_feedback_note || null

    console.debug('[task-mapping] ✅ Row mapped →', JSON.stringify(task))
    return task
}
