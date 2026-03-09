import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/db/mongodb'
import bcrypt from 'bcryptjs'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { validateBody } from '@/lib/middleware/validation'
import { ClientSchema } from '@/lib/db/schemas/client.schema'
import { safeURL } from '@/lib/safe'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const url = safeURL(request.url)
        const lite = url?.searchParams?.get('lite') === '1'

        const clients = await database.collection('clients').find({}).sort({ created_at: -1 }).toArray()
        const cleanClients = clients.map(({ _id, ...client }) => client)

        // Lightweight mode for picker/dropdown contexts (tasks/content/import/reports).
        if (lite) {
            return handleCORS(NextResponse.json(cleanClients))
        }

        // Full mode (dashboard): aggregate counts in one pass instead of N+1 counts per client.
        const taskCounts = await database.collection('tasks').aggregate([
            {
                $group: {
                    _id: '$client_id',
                    task_count: { $sum: 1 },
                    in_progress_count: {
                        $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] }
                    },
                    approval_count: {
                        $sum: { $cond: [{ $eq: ['$status', 'Pending Review'] }, 1, 0] }
                    }
                }
            }
        ]).toArray()

        const countMap = Object.fromEntries(taskCounts.map((t) => [t._id, t]))
        const clientsWithCounts = cleanClients.map((client) => {
            const counts = countMap[client.id]
            return {
                ...client,
                task_count: counts?.task_count || 0,
                in_progress_count: counts?.in_progress_count || 0,
                approval_count: counts?.approval_count || 0
            }
        })

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
        const { name, service_type, portal_password, email } = cleanData

        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        const existing = await database.collection('clients').findOne({ slug })
        const finalSlug = existing ? `${slug}-${Date.now()}` : slug

        const hashedPortalPassword = portal_password ? await bcrypt.hash(portal_password, 10) : null

        const client = {
            id: uuidv4(), name, slug: finalSlug,
            service_type: service_type || 'SEO',
            portal_password: hashedPortalPassword,
            email: email || null,
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
