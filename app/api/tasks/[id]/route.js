import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyTaskTransition, assertTaskInvariant } from '@/lib/lifecycleEngine'
import { validateBody, rejectFields } from '@/lib/validation'
import { TaskUpdateSchema } from '@/lib/schemas/task.schema'

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    return withAuth(request, async () => {
        const { id: taskId } = params
        const database = await connectToMongo()
        const task = await database.collection('tasks').findOne({ id: taskId })
        if (!task) return handleCORS(NextResponse.json({ error: 'Task not found' }, { status: 404 }))
        const { _id, ...result } = task
        return handleCORS(NextResponse.json(result))
    })
}

const FORBIDDEN_FIELDS = [
    'client_link_visible',
    'client_approval',
    'client_feedback_at'
];

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        const { id: taskId } = params
        const database = await connectToMongo()
        const body = await request.json()

        // 1. Strict Mutation Isolation: Reject injection of lifecycle fields
        const rejection = rejectFields(body, FORBIDDEN_FIELDS)
        if (!rejection.success) {
            return handleCORS(NextResponse.json(rejection.error, { status: 400 }))
        }

        // 2. Schema Validation
        const validation = validateBody(TaskUpdateSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanUpdate = validation.data

        // 3. Load Current State
        const current = await database.collection('tasks').findOne({ id: taskId })
        if (!current) return handleCORS(NextResponse.json({ error: 'Task not found' }, { status: 404 }))

        // 4. Concurrency Control: Optimistic Locking
        if (body.updated_at && current.updated_at) {
            const clientTime = new Date(body.updated_at).getTime()
            const dbTime = new Date(current.updated_at).getTime()
            if (clientTime < dbTime) {
                return handleCORS(NextResponse.json({
                    error: 'Concurrency error: Task has been modified by another user',
                    current: current
                }, { status: 409 }))
            }
        }

        // 5. Apply Lifecycle Engine (Sole Authority)
        const finalState = applyTaskTransition(current, cleanUpdate);

        // 6. Atomic Update
        const result = await database.collection('tasks').updateOne(
            { id: taskId, updated_at: current.updated_at }, // Match version
            { $set: finalState }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Update conflict or record missing' }, { status: 409 }))
        }

        // 7. Post-Update Re-Verification (Double-check everything)
        const updated = await database.collection('tasks').findOne({ id: taskId })
        try {
            assertTaskInvariant(updated);
        } catch (criticalError) {
            console.error('CRITICAL: Post-update invariant violation!', { taskId, state: updated });
            return handleCORS(NextResponse.json({ error: 'Critical system error: Invariant violation' }, { status: 500 }))
        }

        const { _id, ...responseBody } = updated
        return handleCORS(NextResponse.json(responseBody))
    })
}

export async function DELETE(request, { params }) {
    return withAuth(request, async () => {
        const { id: taskId } = params
        const database = await connectToMongo()
        const result = await database.collection('tasks').deleteOne({ id: taskId })
        if (result.deletedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Task not found or already deleted' }, { status: 404 }))
        }
        return handleCORS(NextResponse.json({ message: 'Task deleted' }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
