/**
 * Agency Dashboard Lifecycle Engine
 * Centralized logic for task and content state transitions.
 * Ensures data integrity and enforces atomic business rules.
 */

// --- TASK LIFECYCLE ---

const TASK_LEVELS = ['To Be Started', 'In Progress', 'Completed', 'Blocked'];
const TASK_PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const TASK_APPROVALS = ['Pending Review', 'Approved', 'Required Changes'];

/**
 * Validates logical consistency of a task state.
 * Hard-fails if invariants are violated.
 */
export function assertTaskInvariant(task) {
    if (!task) return;

    // 1. RULE: Sent -> requires Approved (Internal) AND Completed
    if (task.client_link_visible === true) {
        if (task.internal_approval !== 'Approved') {
            throw new Error('Invariant Violation: Cannot set client_link_visible without internal_approval="Approved"');
        }
        if (task.status !== 'Completed') {
            throw new Error('Invariant Violation: Cannot set client_link_visible unless status="Completed"');
        }
    }

    // 2. RULE: Internal Approved -> requires Completed
    if (task.internal_approval === 'Approved' && task.status !== 'Completed') {
        throw new Error('Invariant Violation: internal_approval="Approved" requires status="Completed"');
    }

    // 3. RULE: Incomplete -> cannot be visible
    if (task.status !== 'Completed' && task.client_link_visible === true) {
        throw new Error('Invariant Violation: Status must be "Completed" for the client link to be visible');
    }

    // 4. RULE: Client Feedback -> implies progress
    if (task.client_approval === 'Required Changes') {
        if (task.status !== 'In Progress' || task.internal_approval !== 'Pending' || task.client_link_visible === true) {
            throw new Error('Invariant Violation: "Required Changes" must force In Progress / Pending / Not Visible state');
        }
    }

    // 5. Enum validation (logical double-check)
    if (task.status && !TASK_LEVELS.includes(task.status)) throw new Error(`Invalid status: ${task.status}`);
    if (task.client_approval && !TASK_APPROVALS.includes(task.client_approval)) throw new Error(`Invalid client_approval: ${task.client_approval}`);
}

export function applyTaskTransition(currentTask, updates) {
    const base = currentTask || {};
    const transitioned = { ...base, ...updates };

    // Set defaults for creations
    if (!currentTask) {
        if (!transitioned.status) transitioned.status = 'To Be Started';
        if (!transitioned.internal_approval) transitioned.internal_approval = 'Pending';
        if (!transitioned.created_at) transitioned.created_at = new Date();
    }

    // --- REVERT RULES (Side effects based on intent) ---
    const isUpdate = !!currentTask;

    // 1. RULE: Status Revert - If status moves away from "Completed"
    if (isUpdate && updates.status && updates.status !== 'Completed' && currentTask.status === 'Completed') {
        transitioned.internal_approval = 'Pending';
        transitioned.client_link_visible = false;
        transitioned.client_approval = null;
    }

    // 2. RULE: QA Revert - If internal_approval moves to "Pending"
    if (isUpdate && updates.internal_approval === 'Pending' && currentTask.internal_approval === 'Approved') {
        transitioned.client_link_visible = false;
        transitioned.client_approval = null;
    }

    // 3. RULE: Link Change Reset - If link_url changes and was previously sent
    if (isUpdate && updates.link_url !== undefined && updates.link_url !== currentTask.link_url && currentTask.client_link_visible === true) {
        transitioned.internal_approval = 'Pending';
        transitioned.client_link_visible = false;
        transitioned.client_approval = null;
    }

    // --- EFFECT RULES ---

    // 4. RULE: Client Feedback Logic (Required Changes)
    if (updates.client_approval === 'Required Changes') {
        transitioned.status = 'In Progress';
        transitioned.internal_approval = 'Pending';
        transitioned.client_link_visible = false;
        transitioned.client_feedback_at = new Date();
    }

    // 5. RULE: Link visibility activation
    if (updates.client_link_visible === true && (!currentTask || currentTask.client_link_visible === false)) {
        if (!transitioned.link_url) throw new Error('Cannot enable visibility without a link');
        transitioned.client_approval = 'Pending Review';
    }

    // Always update timestamp
    transitioned.updated_at = new Date();

    // FINAL GUARD: Never return an invalid state
    assertTaskInvariant(transitioned);

    return transitioned;
}

// --- CONTENT LIFECYCLE ---

const CONTENT_TOPIC_STATUS = ['Pending', 'Approved', 'Rejected'];
const CONTENT_BLOG_STATUS = ['Pending Review', 'Approved', 'Changes Required'];

/**
 * Validates logical consistency of a content item state.
 * Hard-fails if invariants are violated.
 */
export function assertContentInvariant(item) {
    if (!item) return;

    // 1. RULE: Blog Approved -> requires Link
    if (item.blog_approval_status === 'Approved' && !item.blog_link) {
        throw new Error('Invariant Violation: blog_approval_status="Approved" requires a blog_link');
    }

    // 2. RULE: Dates must exist if approved
    if (item.topic_approval_status === 'Approved' && !item.topic_approval_date) {
        throw new Error('Invariant Violation: Approved topic requires topic_approval_date');
    }
    if (item.blog_approval_status === 'Approved' && !item.blog_approval_date) {
        throw new Error('Invariant Violation: Approved blog requires blog_approval_date');
    }
}

export function applyContentTransition(currentContent, updates) {
    const base = currentContent || {};
    const transitioned = { ...base, ...updates };

    // Set defaults for creations
    if (!currentContent) {
        if (!transitioned.blog_status) transitioned.blog_status = 'Draft';
        if (!transitioned.topic_approval_status) transitioned.topic_approval_status = 'Pending';
        if (!transitioned.blog_approval_status) transitioned.blog_approval_status = 'Pending Review';
        if (!transitioned.created_at) transitioned.created_at = new Date();
    }

    // --- EFFECT RULES ---
    const isUpdate = !!currentContent;

    // 1. Topic Approval Date
    if (updates.topic_approval_status === 'Approved' && (!isUpdate || currentContent.topic_approval_status !== 'Approved')) {
        transitioned.topic_approval_date = new Date().toISOString().split('T')[0];
    }

    // 2. Blog Approval Date
    if (updates.blog_approval_status === 'Approved' && (!isUpdate || currentContent.blog_approval_status !== 'Approved')) {
        transitioned.blog_approval_date = new Date().toISOString().split('T')[0];
    }

    // 3. Reset approvals on link change
    if (isUpdate && updates.blog_link !== undefined && updates.blog_link !== currentContent.blog_link) {
        if (currentContent.blog_approval_status === 'Approved') {
            transitioned.blog_approval_status = 'Pending Review';
            transitioned.blog_approval_date = null;
        }
    }

    // Always update timestamp
    transitioned.updated_at = new Date();

    // FINAL GUARD
    assertContentInvariant(transitioned);

    return transitioned;
}
