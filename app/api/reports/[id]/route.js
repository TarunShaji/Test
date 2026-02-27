import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: reportId } = params
            const database = await connectToMongo()
            const body = await request.json()

            const { _id, id, ...updateData } = body
            await database.collection('reports').updateOne({ id: reportId }, { $set: updateData })

            const updated = await database.collection('reports').findOne({ id: reportId })
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
            const { id: reportId } = params
            const database = await connectToMongo()

            await database.collection('reports').deleteOne({ id: reportId })
            return handleCORS(NextResponse.json({ message: 'Report deleted' }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
