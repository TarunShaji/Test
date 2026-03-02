import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { safeURL, safeArray } from '@/lib/safe'
import { validateBody } from '@/lib/validation'
import { ReportSchema } from '@/lib/schemas/report.schema'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const url = safeURL(request.url)
        const clientId = url.searchParams.get('client_id')
        const query = clientId ? { client_id: clientId } : {}

        const reports = await database.collection('reports').find(query).sort({ report_date: -1 }).toArray()
        const clean = safeArray(reports).map(({ _id, ...r }) => r)

        // Enrich with client names
        const clientIds = [...new Set(clean.map(r => r.client_id))]
        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }).toArray() : []
        const clientMap = Object.fromEntries(safeArray(clients).map(c => [c.id, c.name]))

        const enriched = clean.map(r => ({ ...r, client_name: clientMap[r.client_id] || 'Unknown' }))
        return handleCORS(NextResponse.json(enriched))
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
