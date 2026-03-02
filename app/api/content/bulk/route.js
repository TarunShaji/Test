import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyContentTransition } from '@/lib/lifecycleEngine'

import { ContentSchema } from '@/lib/schemas/content.schema'
import { validateBody } from '@/lib/validation'
import { z } from 'zod'

export async function POST(request) {
    return withAuth(request, async () => {
        try {
            const database = await connectToMongo()
            const body = await request.json()

            // Explicit import schema — does NOT inherit .strict() from ContentSchema.
            // Unknown fields are stripped, not rejected.
            const ContentImportItemSchema = z.object({
                blog_title: z.string().min(1),
                client_id: z.string().optional().nullable(),
                week: z.string().optional().nullable(),
                primary_keyword: z.string().optional().nullable(),
                blog_type: z.string().optional().nullable(),
                writer: z.string().optional().nullable(),
                blog_status: z.string().optional().nullable(),
                blog_link: z.string().optional().nullable(),
                published_date: z.string().optional().nullable(),
            }) // no .strict() — unknown keys stripped by default

            const validation = validateBody(z.object({
                items: z.array(ContentImportItemSchema),
                client_id: z.string().uuid()
            }), body)

            if (!validation.success) {
                console.error('[content/bulk] Validation failed:', JSON.stringify(validation.error))
                return handleCORS(NextResponse.json(validation.error, { status: 400 }))
            }

            const { items, client_id } = validation.data

            const now = new Date()
            const docs = []
            const errors = []

            for (const item of items) {
                try {
                    const doc = applyContentTransition(null, {
                        ...item,
                        id: uuidv4(),
                        client_id,
                        created_at: now,
                        updated_at: now
                    })
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
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function DELETE(request) {
    return withAuth(request, async () => {
        try {
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
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
