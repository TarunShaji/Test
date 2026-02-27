import { applyContentTransition, assertContentInvariant } from '@/lib/lifecycleEngine'

export async function PUT(request, { params }) {
    return withErrorLogging(request, async () => {
        const { slug, contentId } = params
        const body = await request.json()
        const { topic_approval_status, blog_approval_status, blog_link } = body
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

        const item = await database.collection('content_items').findOne({ id: contentId, client_id: clientDoc.id })
        if (!item) return handleCORS(NextResponse.json({ error: 'Content item not found' }, { status: 404 }))

        // Execute centralized lifecycle logic
        let finalState;
        try {
            const updates = {};
            if (topic_approval_status) updates.topic_approval_status = topic_approval_status;
            if (blog_approval_status) updates.blog_approval_status = blog_approval_status;
            if (blog_link) updates.blog_link = blog_link;

            finalState = applyContentTransition(item, updates);
        } catch (error) {
            return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
        }

        // Atomic Update
        await database.collection('content_items').updateOne(
            { id: contentId },
            { $set: finalState }
        )

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
