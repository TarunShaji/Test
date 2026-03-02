import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyContentTransition, assertContentInvariant } from '@/lib/lifecycleEngine'

export const runtime = 'nodejs';

/**
 * POST /api/content/[id]/publish
 * Sets client_link_visible_blog=true (sends the blog link to the client portal).
 * Requires: blog_internal_approval="Approved" AND blog_link set.
 * Mirrors the task publish endpoint exactly.
 */
export async function POST(request, { params }) {
    return withAuth(request, async () => {
        const { id: contentId } = params
        const database = await connectToMongo()

        const current = await database.collection('content_items').findOne({ id: contentId })
        if (!current) return handleCORS(NextResponse.json({ error: 'Content item not found' }, { status: 404 }))

        let body = {}
        try { body = await request.json() } catch (e) { /* empty body ok */ }

        // Optimistic locking
        if (body.updated_at && current.updated_at) {
            const clientTime = new Date(body.updated_at).getTime()
            const dbTime = new Date(current.updated_at).getTime()
            if (clientTime < dbTime) {
                return handleCORS(NextResponse.json({
                    error: 'Concurrency error: Content has been modified by another user',
                    current
                }, { status: 409 }))
            }
        }

        // Apply publish transition via lifecycle engine
        let finalUpdate
        try {
            finalUpdate = applyContentTransition(current, { client_link_visible_blog: true })
        } catch (error) {
            return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
        }

        const result = await database.collection('content_items').updateOne(
            { id: contentId, updated_at: current.updated_at },
            { $set: finalUpdate }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Update conflict: Content state changed during operation' }, { status: 409 }))
        }

        const updated = await database.collection('content_items').findOne({ id: contentId })
        try {
            assertContentInvariant(updated)
        } catch (criticalError) {
            console.error('CRITICAL: Post-publish invariant violation!', { contentId, state: updated })
            return handleCORS(NextResponse.json({ error: 'Critical system error: Invariant violation' }, { status: 500 }))
        }

        return handleCORS(NextResponse.json({
            message: 'Blog link sent to client portal',
            content: updated
        }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
