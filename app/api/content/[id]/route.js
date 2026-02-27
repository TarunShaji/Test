import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyContentTransition, assertContentInvariant } from '@/lib/lifecycleEngine'
import { validateBody, rejectFields } from '@/lib/validation'
import { ContentUpdateSchema } from '@/lib/schemas/content.schema'

const FORBIDDEN_FIELDS = [
    'topic_approval_date',
    'blog_approval_date',
    '_id'
];

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        const { id: contentId } = params
        const database = await connectToMongo()
        const body = await request.json()

        // 1. Strict Mutation Isolation: Reject injection of lifecycle fields
        const rejection = rejectFields(body, FORBIDDEN_FIELDS)
        if (!rejection.success) {
            return handleCORS(NextResponse.json(rejection.error, { status: 400 }))
        }

        // 2. Schema Validation
        const validation = validateBody(ContentUpdateSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanUpdate = validation.data

        // 3. Load Current State
        const current = await database.collection('content_items').findOne({ id: contentId })
        if (!current) return handleCORS(NextResponse.json({ error: 'Content item not found' }, { status: 404 }))

        // 4. Concurrency Control: Optimistic Locking
        if (body.updated_at && current.updated_at) {
            const clientTime = new Date(body.updated_at).getTime()
            const dbTime = new Date(current.updated_at).getTime()
            if (clientTime < dbTime) {
                return handleCORS(NextResponse.json({
                    error: 'Concurrency error: Content has been modified by another user',
                    current: current
                }, { status: 409 }))
            }
        }

        // 5. Apply Lifecycle Engine (Sole Authority)
        let finalState;
        try {
            finalState = applyContentTransition(current, cleanUpdate);
        } catch (error) {
            return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
        }

        // 6. Atomic Update
        const result = await database.collection('content_items').updateOne(
            { id: contentId, updated_at: current.updated_at },
            { $set: finalState }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Update conflict: Content state changed during operation' }, { status: 409 }))
        }

        // 6. Post-Update Re-Verification
        const updated = await database.collection('content_items').findOne({ id: contentId })
        try {
            assertContentInvariant(updated);
        } catch (criticalError) {
            console.error('CRITICAL: Post-update invariant violation!', { contentId, state: updated });
            return handleCORS(NextResponse.json({ error: 'Critical system error: Invariant violation' }, { status: 500 }))
        }

        const { _id, ...responseBody } = updated
        return handleCORS(NextResponse.json(responseBody))
    })
}

export async function DELETE(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: contentId } = params
            const database = await connectToMongo()

            const result = await database.collection('content_items').deleteOne({ id: contentId })
            if (result.deletedCount === 0) {
                return handleCORS(NextResponse.json({ error: 'Content item not found or already deleted' }, { status: 404 }))
            }
            return handleCORS(NextResponse.json({ message: 'Content item deleted' }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
