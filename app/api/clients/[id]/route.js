import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { validateBody, rejectFields } from '@/lib/validation'
import { ClientSchema } from '@/lib/schemas/client.schema'

export async function GET(request, { params }) {
    try {
        const { id } = params
        const database = await connectToMongo()
        const client = await database.collection('clients').findOne({ id })

        if (!client) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        const { _id, ...clientData } = client
        return handleCORS(NextResponse.json(clientData))
    } catch (error) {
        return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
    }
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
        try {
            const { id: clientId } = params
            const database = await connectToMongo()

            await database.collection('clients').deleteOne({ id: clientId })
            await database.collection('tasks').deleteMany({ client_id: clientId })
            await database.collection('reports').deleteMany({ client_id: clientId })

            return handleCORS(NextResponse.json({ message: 'Client deleted' }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
