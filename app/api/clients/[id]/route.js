import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db/mongodb'
import bcrypt from 'bcryptjs'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { validateBody, rejectFields } from '@/lib/middleware/validation'
import { ClientSchema } from '@/lib/db/schemas/client.schema'

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    return withAuth(request, async () => {
        const { id } = params
        const database = await connectToMongo()
        const client = await database.collection('clients').findOne({ id })

        if (!client) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        const { _id, ...clientData } = client
        return handleCORS(NextResponse.json(clientData))
    })
}

const FORBIDDEN_FIELDS = ['id', 'slug', 'is_active'];

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        const { id: clientId } = params
        const database = await connectToMongo()
        const body = await request.json()

        // 1. Strict Mutation Isolation
        const rejection = rejectFields(body, FORBIDDEN_FIELDS)
        if (!rejection.success) {
            return handleCORS(NextResponse.json(rejection.error, { status: 400 }))
        }

        // 2. Schema Validation
        const validation = validateBody(ClientSchema.partial(), body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data
        const { id: unusedId, ...updateData } = cleanData
        updateData.updated_at = new Date()

        if (updateData.portal_password) {
            updateData.portal_password = await bcrypt.hash(updateData.portal_password, 10)
        }

        // 3. Update
        const result = await database.collection('clients').updateOne(
            { id: clientId },
            { $set: updateData }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))
        }

        const updated = await database.collection('clients').findOne({ id: clientId })
        const { _id, ...clientData } = updated

        return handleCORS(NextResponse.json(clientData))
    })
}

export async function DELETE(request, { params }) {
    return withAuth(request, async () => {
        const { id: clientId } = params
        const database = await connectToMongo()
        const existing = await database.collection('clients').findOne({ id: clientId }, { projection: { id: 1 } })
        if (!existing) {
            return handleCORS(NextResponse.json({ error: 'Client not found or already deleted' }, { status: 404 }))
        }

        // Safe cascade delete of all client-scoped collections.
        const [tasks, emailTasks, paidTasks, content, reports, resources, client] = await Promise.all([
            database.collection('tasks').deleteMany({ client_id: clientId }),
            database.collection('email_tasks').deleteMany({ client_id: clientId }),
            database.collection('paid_tasks').deleteMany({ client_id: clientId }),
            database.collection('content_items').deleteMany({ client_id: clientId }),
            database.collection('reports').deleteMany({ client_id: clientId }),
            database.collection('client_resources').deleteMany({ client_id: clientId }),
            database.collection('clients').deleteOne({ id: clientId }),
        ])

        return handleCORS(NextResponse.json({
            message: 'Client deleted',
            deleted: {
                client: client.deletedCount || 0,
                tasks: tasks.deletedCount || 0,
                email_tasks: emailTasks.deletedCount || 0,
                paid_tasks: paidTasks.deletedCount || 0,
                content_items: content.deletedCount || 0,
                reports: reports.deletedCount || 0,
                client_resources: resources.deletedCount || 0,
            }
        }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
