import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { applyContentTransition } from '@/lib/engine/lifecycle'
import { z } from 'zod'
import { validateBody } from '@/lib/middleware/validation'

export const runtime = 'nodejs';

/**
 * ContentImportItemSchema — a lenient, non-strict schema used ONLY for bulk import.
 */
const ContentImportItemSchema = z.object({
    blog_title: z.string().min(1),
    client_id: z.string().optional().nullable(),
    week: z.string().optional().nullable(),
    primary_keyword: z.string().optional().nullable(),
    secondary_keywords: z.string().optional().nullable(),
    blog_type: z.string().optional().nullable(),
    writer: z.string().optional().nullable(),
    search_volume: z.number().int().nonnegative().optional().nullable(),
    outline_link: z.string().optional().nullable(),
    outline_status: z.string().optional().nullable(),
    required_by: z.string().optional().nullable(),
    date_edited: z.string().optional().nullable(),
    date_sent_for_approval: z.string().optional().nullable(),
    date_approved: z.string().optional().nullable(),
    published_date: z.string().optional().nullable(),
    raw_submission_rating: z.string().optional().nullable(),
    ai_score: z.string().optional().nullable(),
    blog_status: z.string().optional().nullable(),
    topic_approval_status: z.string().optional().nullable(),
    blog_internal_approval: z.string().optional().nullable(),
    intern_status: z.string().optional().nullable(),
    blog_doc_link: z.string().optional().nullable(),
    blog_link: z.string().optional().nullable(),
})

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()

        const validation = validateBody(z.object({
            items: z.array(ContentImportItemSchema),
            client_id: z.string().uuid()
        }), body)

        if (!validation.success) {
            console.error('[content/bulk POST] Validation failed:', JSON.stringify(validation.error))
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const { items, client_id } = validation.data
        const now = new Date()
        const docs = []
        const errors = []

        for (const item of items) {
            try {
                const safeItem = {
                    ...item,
                    id: uuidv4(),
                    client_id,
                    created_at: now,
                    updated_at: now,
                }
                const doc = applyContentTransition(null, safeItem)
                docs.push(doc)
            } catch (err) {
                errors.push({ title: item.blog_title || 'Unknown', error: err.message })
            }
        }

        if (docs.length > 0) {
            await database.collection('content_items').insertMany(docs)
        }

        return handleCORS(NextResponse.json({
            success: true,
            imported: docs.length,
            failed: errors.length,
            errors: errors.length > 0 ? errors : undefined
        }))
    })
}

export async function DELETE(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()
        const { ids } = body

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return handleCORS(NextResponse.json({ error: 'IDs array is required' }, { status: 400 }))
        }

        const result = await database.collection('content_items').deleteMany({ id: { $in: ids } })

        return handleCORS(NextResponse.json({
            message: `Successfully deleted ${result.deletedCount} items`,
            count: result.deletedCount
        }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
