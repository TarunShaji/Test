import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { validateBody, rejectFields } from '@/lib/validation'
import { ReportSchema } from '@/lib/schemas/report.schema'

export const runtime = 'nodejs';

const FORBIDDEN_FIELDS = ['id', 'client_id', 'created_at'];

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        const { id: reportId } = params
        const database = await connectToMongo()
        const body = await request.json()

        // 1. Mutation Isolation
        const rejection = rejectFields(body, FORBIDDEN_FIELDS)
        if (!rejection.success) {
            return handleCORS(NextResponse.json(rejection.error, { status: 400 }))
        }

        // 2. Schema Validation
        const validation = validateBody(ReportSchema.partial(), body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        // 3. Load Current State
        const current = await database.collection('reports').findOne({ id: reportId })
        if (!current) return handleCORS(NextResponse.json({ error: 'Report not found' }, { status: 404 }))

        // 4. Concurrency Control: Optimistic Locking
        if (body.updated_at && current.updated_at) {
            const clientTime = new Date(body.updated_at).getTime()
            const dbTime = new Date(current.updated_at).getTime()
            if (clientTime < dbTime) {
                return handleCORS(NextResponse.json({
                    error: 'Concurrency error: Report has been modified by another user',
                    current: current
                }, { status: 409 }))
            }
        }

        const cleanData = validation.data
        const { id, ...updateData } = cleanData
        updateData.updated_at = new Date()

        // 5. Update
        const result = await database.collection('reports').updateOne(
            { id: reportId, updated_at: current.updated_at }, // Match version
            { $set: updateData }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Update conflict: Report state changed during operation' }, { status: 409 }))
        }

        const updated = await database.collection('reports').findOne({ id: reportId })
        const { _id, ...responseBody } = updated

        return handleCORS(NextResponse.json(responseBody))
    })
}

export async function DELETE(request, { params }) {
    return withAuth(request, async () => {
        const { id: reportId } = params
        const database = await connectToMongo()

        const result = await database.collection('reports').deleteOne({ id: reportId })
        if (result.deletedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Report not found or already deleted' }, { status: 404 }))
        }
        return handleCORS(NextResponse.json({ message: 'Report deleted' }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
