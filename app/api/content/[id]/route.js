import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'

export async function GET(request, { params }) {
    try {
        const { id: contentId } = params
        const database = await connectToMongo()
        const item = await database.collection('content_items').findOne({ id: contentId })

        if (!item) return handleCORS(NextResponse.json({ error: 'Content item not found' }, { status: 404 }))

        const { _id, ...result } = item
        return handleCORS(NextResponse.json(result))
    } catch (error) {
        return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
    }
}

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: contentId } = params
            const database = await connectToMongo()
            const body = await request.json()

            const { _id, id, ...updateData } = body
            updateData.updated_at = new Date()

            await database.collection('content_items').updateOne({ id: contentId }, { $set: updateData })
            const updated = await database.collection('content_items').findOne({ id: contentId })
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
            const { id: contentId } = params
            const database = await connectToMongo()

            await database.collection('content_items').deleteOne({ id: contentId })
            return handleCORS(NextResponse.json({ message: 'Content item deleted' }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
