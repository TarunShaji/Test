import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'

export async function POST(request) {
    return withAuth(request, async () => {
        try {
            const database = await connectToMongo()
            const body = await request.json()
            const { items, client_id } = body

            if (!items || !Array.isArray(items) || !client_id) {
                return handleCORS(NextResponse.json({ error: 'items and client_id required' }, { status: 400 }))
            }

            const now = new Date()
            const docs = items.map(item => ({
                ...item,
                id: uuidv4(),
                client_id,
                created_at: now,
                updated_at: now
            }))

            await database.collection('content_items').insertMany(docs)
            return handleCORS(NextResponse.json({ success: true, imported: docs.length }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
