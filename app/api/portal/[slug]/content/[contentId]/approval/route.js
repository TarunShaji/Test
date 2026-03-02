import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'
import { validateBody } from '@/lib/validation'
import { PortalContentApprovalSchema } from '@/lib/schemas/portal.schema'
import { applyContentTransition, assertContentInvariant } from '@/lib/lifecycleEngine'

export const runtime = 'nodejs';

export async function PUT(request, { params }) {
    return withErrorLogging(request, async () => {
        const { slug, contentId } = params
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

        const validation = validateBody(PortalContentApprovalSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data

        const item = await database.collection('content_items').findOne({ id: contentId, client_id: clientDoc.id })
        if (!item) return handleCORS(NextResponse.json({ error: 'Content item not found' }, { status: 404 }))

        // Execute centralized lifecycle logic
        const finalState = applyContentTransition(item, cleanData);

        // Atomic Update with Optimistic Locking
        const result = await database.collection('content_items').updateOne(
            { id: contentId, updated_at: item.updated_at },
            { $set: finalState }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Update conflict: Content has been modified since it was loaded' }, { status: 409 }))
        }

        // Post-Update Invariant Re-Check
        const updated = await database.collection('content_items').findOne({ id: contentId })
        try {
            assertContentInvariant(updated);
        } catch (criticalError) {
            console.error('CRITICAL: Post-update invariant violation in Content Portal!', { contentId, state: updated });
            return handleCORS(NextResponse.json({ error: 'Critical system error: Invariant violation' }, { status: 500 }))
        }

        return handleCORS(NextResponse.json({ success: true, ...finalState }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
