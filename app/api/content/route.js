import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'

export async function GET(request) {
    return withErrorLogging(request, async () => {
        const database = await connectToMongo()
        const url = new URL(request.url)
        const clientId = url.searchParams.get('client_id')
        const query = clientId ? { client_id: clientId } : {}
        const content = await database.collection('content_items').find(query).sort({ created_at: -1 }).toArray()
        const clean = content.map(({ _id, ...c }) => c)

        // Enrich with client names
        const clientIds = [...new Set(clean.map(c => c.client_id))]
        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }).toArray() : []
        const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
        const enriched = clean.map(c => ({ ...c, client_name: clientMap[c.client_id] || 'Unknown' }))

        return handleCORS(NextResponse.json(enriched))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()
        const { blog_title, client_id } = body

        if (!blog_title || !client_id) {
            return handleCORS(NextResponse.json({ error: 'blog_title and client_id required' }, { status: 400 }))
        }

        const item = {
            id: uuidv4(),
            client_id,
            blog_title,
            status: body.status || 'Draft',
            blog_status: body.blog_status || 'Draft',
            week: body.week || null,
            primary_keyword: body.primary_keyword || null,
            writer: body.writer || null,
            blog_type: body.blog_type || null,
            blog_link: body.blog_link || null,
            topic_approval_status: body.topic_approval_status || 'Pending',
            blog_approval_status: body.blog_approval_status || 'Pending Review',
            published_date: body.published_date || null,
            created_at: new Date(),
            updated_at: new Date()
        }

        await database.collection('content_items').insertOne(item)
        return handleCORS(NextResponse.json(item))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
