import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import bcrypt from 'bcryptjs'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { validateBody } from '@/lib/validation'
import { ClientSchema } from '@/lib/schemas/client.schema'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const clients = await database.collection('clients').find({}).sort({ created_at: -1 }).toArray()

        // Add task counts
        const clientsWithCounts = await Promise.all(clients.map(async (c) => {
            const { _id, ...client } = c
            const taskCount = await database.collection('tasks').countDocuments({ client_id: client.id })
            const inProgressCount = await database.collection('tasks').countDocuments({ client_id: client.id, status: 'In Progress' })
            const approvalCount = await database.collection('tasks').countDocuments({ client_id: client.id, status: 'Pending Review' })
            return { ...client, task_count: taskCount, in_progress_count: inProgressCount, approval_count: approvalCount }
        }))

        return handleCORS(NextResponse.json(clientsWithCounts))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()

        const validation = validateBody(ClientSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data
        const { name, service_type, portal_password } = cleanData

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const existing = await database.collection('clients').findOne({ slug })
        const finalSlug = existing ? `${slug}-${Date.now()}` : slug

        const hashedPortalPassword = portal_password ? await bcrypt.hash(portal_password, 10) : null

        const client = {
            id: uuidv4(), name, slug: finalSlug,
            service_type: service_type || 'SEO',
            portal_password: hashedPortalPassword,
            is_active: true,
            created_at: new Date()
        }

        await database.collection('clients').insertOne(client)
        return handleCORS(NextResponse.json(client))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
