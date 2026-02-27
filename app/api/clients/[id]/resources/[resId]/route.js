import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const { id: clientId, resId } = params
            const database = await connectToMongo()
            const body = await request.json()

            const { id, _id, client_id, created_at, ...updateData } = body
            updateData.updated_at = new Date()

            const result = await database.collection('client_resources').updateOne(
                { id: resId, client_id: clientId },
                { $set: updateData }
            )

            if (result.matchedCount === 0) {
                return handleCORS(NextResponse.json({ error: 'Resource not found' }, { status: 404 }))
            }

            const updated = await database.collection('client_resources').findOne({ id: resId })
            const { _id: _, ...clean } = updated

            return handleCORS(NextResponse.json(clean))
        })
    })
}

export async function DELETE(request, { params }) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const { id: clientId, resId } = params
            const database = await connectToMongo()

            const result = await database.collection('client_resources').deleteOne({
                id: resId,
                client_id: clientId
            })

            if (result.deletedCount === 0) {
                return handleCORS(NextResponse.json({ error: 'Resource not found' }, { status: 404 }))
            }

            return handleCORS(NextResponse.json({ message: 'Resource deleted' }))
        })
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
