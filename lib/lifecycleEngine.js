/**
 * Agency Dashboard Lifecycle Engine
 * Centralized logic for task state transitions.
 * Ensures data integrity and enforces atomic business rules.
 */

export function applyTaskTransition(currentTask, updates) {
    const transitioned = { ...updates };

    // --- REVERT RULES (Must happen before guards) ---

    // 1. RULE: Status Revert - If status moves away from "Completed"
    if (transitioned.status && transitioned.status !== 'Completed' && currentTask.status === 'Completed') {
        transitioned.internal_approval = 'Pending';
        transitioned.client_link_visible = false;
        transitioned.client_approval = null;
    }

    // 2. RULE: QA Revert - If internal_approval moves to "Pending"
    if (transitioned.internal_approval === 'Pending' && currentTask.internal_approval === 'Approved') {
        transitioned.client_link_visible = false;
        transitioned.client_approval = null;
    }

    // 3. RULE: Link Change Reset - If link_url changes and was previously sent
    if (transitioned.link_url !== undefined && transitioned.link_url !== currentTask.link_url && currentTask.client_link_visible === true) {
        transitioned.internal_approval = 'Pending';
        transitioned.client_link_visible = false;
        transitioned.client_approval = null;
    }

    // --- GUARD RULES (Validating the final state) ---

    // 4. GUARD: Internal Approval can ONLY be "Approved" if status is "Completed"
    const finalStatus = transitioned.status || currentTask.status;
    const finalInternalApproval = transitioned.internal_approval || currentTask.internal_approval;

    if (finalInternalApproval === 'Approved' && finalStatus !== 'Completed') {
        throw new Error('Invalid transition: Internal approval requires Completed status');
    }

    // 5. GUARD: Send Link Guard (Atomic check)
    if (transitioned.client_link_visible === true && currentTask.client_link_visible === false) {
        const hasLink = transitioned.link_url || currentTask.link_url;
        const isCompleted = (transitioned.status || currentTask.status) === 'Completed';
        const isApproved = (transitioned.internal_approval || currentTask.internal_approval) === 'Approved';

        if (!hasLink || !isCompleted || !isApproved) {
            throw new Error('Invalid transition: Cannot send link unless task is Completed, Approved, and has a link');
        }
        transitioned.client_approval = 'Pending Review';
    }

    // --- SECONDARY EFFECTS ---

    // 6. EFFECT: Client Feedback Logic (Required Changes)
    if (transitioned.client_approval === 'Required Changes') {
        transitioned.status = 'In Progress';
        transitioned.internal_approval = 'Pending';
        transitioned.client_link_visible = false;
        transitioned.client_feedback_at = new Date();
    }

    // Always update the timestamp
    transitioned.updated_at = new Date();

    return transitioned;
}
