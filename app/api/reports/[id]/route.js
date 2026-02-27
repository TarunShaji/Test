import { validateBody, rejectFields } from '@/lib/validation'
import { ReportSchema } from '@/lib/schemas/report.schema'

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

        const cleanData = validation.data
        const { id, ...updateData } = cleanData

        // 3. Update
        const result = await database.collection('reports').updateOne(
            { id: reportId },
            { $set: updateData }
        )

        if (result.matchedCount === 0) {
            return handleCORS(NextResponse.json({ error: 'Report not found' }, { status: 404 }))
        }

        const updated = await database.collection('reports').findOne({ id: reportId })
        const { _id, ...responseBody } = updated

        return handleCORS(NextResponse.json(responseBody))
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
