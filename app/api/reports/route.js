import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { safeURL, safeArray } from '@/lib/safe'
import { validateBody } from '@/lib/middleware/validation'
import { ReportSchema } from '@/lib/db/schemas/report.schema'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const url = safeURL(request.url)
        const clientId = url.searchParams.get('client_id')
        const query = clientId ? { client_id: clientId } : {}
        const pageParam = url.searchParams.get('page')
        const limitParam = url.searchParams.get('limit')
        const usePagination = pageParam !== null || limitParam !== null
        const page = Math.max(parseInt(pageParam || '1', 10), 1)
        const limit = Math.max(parseInt(limitParam || '50', 10), 1)
        const skip = (page - 1) * limit

        const cursor = database.collection('reports').find(query).sort({ report_date: -1 })
        const reports = usePagination
            ? await cursor.skip(skip).limit(limit).toArray()
            : await cursor.toArray()
        const clean = safeArray(reports).map(({ _id, ...r }) => r)

        // Enrich with client names
        const clientIds = [...new Set(clean.map(r => r.client_id))]
        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }).toArray() : []
        const clientMap = Object.fromEntries(safeArray(clients).map(c => [c.id, c.name]))

        const enriched = clean.map(r => ({ ...r, client_name: clientMap[r.client_id] || 'Unknown' }))
        if (!usePagination) {
            return handleCORS(NextResponse.json(enriched))
        }

        const total = await database.collection('reports').countDocuments(query)
        const totalPages = Math.ceil(total / limit)
        return handleCORS(NextResponse.json({
            data: enriched,
            total,
            page,
            totalPages
        }))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()

        const validation = validateBody(ReportSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data
        const { title, client_id, report_url, report_date, report_type } = cleanData

        const report = {
            id: uuidv4(), client_id, title,
            report_type: report_type || 'Custom',
            report_url,
            report_date: report_date || new Date().toISOString().split('T')[0],
            notes: cleanData.notes || null,
            created_at: new Date()
        }

        await database.collection('reports').insertOne(report)
        return handleCORS(NextResponse.json(report))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
