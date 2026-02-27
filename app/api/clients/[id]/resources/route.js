import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'

export async function GET(request, { params }) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const { id: clientId } = params
            const database = await connectToMongo()

            const resources = await database.collection('client_resources')
                .find({ client_id: clientId })
                .sort({ created_at: -1 })
                .toArray()

            const clean = resources.map(({ _id, ...r }) => r)
            return handleCORS(NextResponse.json(clean))
        })
    })
}

export async function POST(request, { params }) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const { id: clientId } = params
            const database = await connectToMongo()
            const body = await request.json()
            const { name, url, type, category } = body

            if (!name || !url) {
                return handleCORS(NextResponse.json({ error: 'Name and URL are required' }, { status: 400 }))
            }

            const now = new Date()
            const resource = {
                id: uuidv4(),
                client_id: clientId,
                name: name.trim(),
                url: url.trim(),
                type: type || 'link',
                category: category || 'Assets',
                created_at: now,
                updated_at: now
            }

            await database.collection('client_resources').insertOne(resource)
            const { _id, ...result } = resource
            return handleCORS(NextResponse.json(result, { status: 201 }))
        })
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
