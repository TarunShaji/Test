import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db/mongodb'
import { withAuth, withErrorLogging } from '@/lib/middleware/api-utils'

export const runtime = 'nodejs';

/**
 * Reorders content items based on a provided list of IDs.
 * Expects { ids: string[] }
 */
export async function PUT(request) {
    return withAuth(request, async (user) => {
        const body = await request.json()
        const { ids } = body

        if (!Array.isArray(ids)) {
            return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
        }

        const database = await connectToMongo()

        // Bulk update positions based on the array index
        const ops = ids.map((id, index) => ({
            updateOne: {
                filter: { id },
                update: { $set: { position: index, updated_at: new Date() } }
            }
        }))

        if (ops.length > 0) {
            await database.collection('content_items').bulkWrite(ops)
        }

        return NextResponse.json({ success: true, count: ops.length })
    })
}
