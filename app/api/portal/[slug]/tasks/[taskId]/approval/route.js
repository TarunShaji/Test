import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'
import { validateBody } from '@/lib/validation'
import { PortalTaskApprovalSchema } from '@/lib/schemas/portal.schema'
import { applyTaskTransition, assertTaskInvariant } from '@/lib/lifecycleEngine'

export const runtime = 'nodejs';

export async function PUT(request, { params }) {
    return withErrorLogging(request, async () => {
        const { slug, taskId } = params
        const body = await request.json()
        const database = await connectToMongo()

        const clientDoc = await database.collection('clients').findOne({ slug, is_active: true })
        if (!clientDoc) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        // Security check
        if (clientDoc.portal_password) {
            const authHeader = request.headers.get('X-Portal-Password')
            if (!authHeader || authHeader !== clientDoc.portal_password) {
                return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
            }
        }

        const validation = validateBody(PortalTaskApprovalSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data

        const task = await database.collection('tasks').findOne({ id: taskId, client_id: clientDoc.id })
        if (!task) return handleCORS(NextResponse.json({ error: 'Task not found' }, { status: 404 }))

        // Execute centralized lifecycle logic
        const finalState = applyTaskTransition(task, cleanData);

        // Atomic Update with Optimistic Locking
        const result = await database.collection('tasks').updateOne(
            { id: taskId, updated_at: task.updated_at },
            { $set: finalState }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Update conflict: Task has been modified since it was loaded' }, { status: 409 }))
        }

        // Post-Update Invariant Re-Check
        const updated = await database.collection('tasks').findOne({ id: taskId })
        try {
            assertTaskInvariant(updated);
        } catch (criticalError) {
            console.error('CRITICAL: Post-update invariant violation in Portal!', { taskId, state: updated });
            return handleCORS(NextResponse.json({ error: 'Critical system error: Invariant violation' }, { status: 500 }))
        }

        return handleCORS(NextResponse.json({ success: true, ...finalState }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
