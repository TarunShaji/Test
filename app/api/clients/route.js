import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'

export async function GET(request) {
    return withErrorLogging(request, async () => {
        const database = await connectToMongo()
        const clients = await database.collection('clients').find({}).sort({ created_at: -1 }).toArray()

        // Add task counts
        const clientsWithCounts = await Promise.all(clients.map(async (c) => {
            const { _id, ...client } = c
            const taskCount = await database.collection('tasks').countDocuments({ client_id: client.id })
            const inProgressCount = await database.collection('tasks').countDocuments({ client_id: client.id, status: 'In Progress' })
            const approvalCount = await database.collection('tasks').countDocuments({ client_id: client.id, status: 'To Be Approved' })
            return { ...client, task_count: taskCount, in_progress_count: inProgressCount, approval_count: approvalCount }
        }))

        return handleCORS(NextResponse.json(clientsWithCounts))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        try {
            const database = await connectToMongo()
            const body = await request.json()
            const { name, service_type, portal_password } = body

            if (!name) return handleCORS(NextResponse.json({ error: 'Name required' }, { status: 400 }))

            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            const existing = await database.collection('clients').findOne({ slug })
            const finalSlug = existing ? `${slug}-${Date.now()}` : slug

            const client = {
                id: uuidv4(), name, slug: finalSlug,
                service_type: service_type || 'SEO',
                portal_password: portal_password || null,
                is_active: true,
                created_at: new Date()
            }

            await database.collection('clients').insertOne(client)
            return handleCORS(NextResponse.json(client))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
