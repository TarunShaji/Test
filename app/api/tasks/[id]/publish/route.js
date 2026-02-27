import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyTaskTransition, assertTaskInvariant } from '@/lib/lifecycleEngine'

export async function POST(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: taskId } = params
            const database = await connectToMongo()

            // Fetch current state
            const current = await database.collection('tasks').findOne({ id: taskId })
            if (!current) return handleCORS(NextResponse.json({ error: 'Task not found' }, { status: 404 }))

            // Apply "Publish" transition via lifecycle engine
            let finalUpdate;
            try {
                // Requesting visibility toggles the 'Send Link' action in the engine
                finalUpdate = applyTaskTransition(current, { client_link_visible: true });
            } catch (error) {
                return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
            }

            await database.collection('tasks').updateOne(
                { id: taskId },
                { $set: finalUpdate }
            )

            // Post-Update Re-Verification
            const updated = await database.collection('tasks').findOne({ id: taskId })
            try {
                assertTaskInvariant(updated);
            } catch (criticalError) {
                console.error('CRITICAL: Post-update invariant violation in Publish!', { taskId, state: updated });
                return handleCORS(NextResponse.json({ error: 'Critical system error: Invariant violation' }, { status: 500 }))
            }

            return handleCORS(NextResponse.json({
                message: 'Task successfully published to portal',
                task: updated
            }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
