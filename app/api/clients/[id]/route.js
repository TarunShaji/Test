import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'

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

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: clientId } = params
            const database = await connectToMongo()
            const body = await request.json()

            const { _id, id, ...updateData } = body
            updateData.updated_at = new Date()

            await database.collection('clients').updateOne({ id: clientId }, { $set: updateData })
            const updated = await database.collection('clients').findOne({ id: clientId })
            const { _id: _, ...result } = updated

            return handleCORS(NextResponse.json(result))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
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
