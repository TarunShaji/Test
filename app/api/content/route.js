import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyContentTransition } from '@/lib/lifecycleEngine'
import { safeURL, safeArray } from '@/lib/safe'
import { validateBody } from '@/lib/validation'
import { ContentSchema } from '@/lib/schemas/content.schema'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const url = safeURL(request.url)
        const clientId = url.searchParams.get('client_id')
        const query = clientId ? { client_id: clientId } : {}
        const content = await database.collection('content_items').find(query).sort({ created_at: -1 }).toArray()
        const clean = safeArray(content).map(({ _id, ...c }) => c)

        // Enrich with client names
        const clientIds = [...new Set(clean.map(c => c.client_id))]
        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }).toArray() : []
        const clientMap = Object.fromEntries(safeArray(clients).map(c => [c.id, c.name]))
        const enriched = clean.map(c => ({ ...c, client_name: clientMap[c.client_id] || 'Unknown' }))

        return handleCORS(NextResponse.json(enriched))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()

        const validation = validateBody(ContentSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data
        const { blog_title, client_id } = cleanData

        const item = applyContentTransition(null, {
            id: uuidv4(),
            client_id,
            blog_title,
            ...cleanData
        });

        await database.collection('content_items').insertOne(item)
        return handleCORS(NextResponse.json(item))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
