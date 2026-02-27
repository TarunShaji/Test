import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'
import { safeArray } from '@/lib/safe'

export async function GET(request, { params }) {
    return withErrorLogging(request, async () => {
        const { slug } = params
        const database = await connectToMongo()
        const client = await database.collection('clients').findOne({ slug, is_active: true })

        if (!client) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        const { _id, portal_password: pp, ...clientData } = client
        const hasPassword = !!pp

        if (hasPassword) {
            const authHeader = request.headers.get('X-Portal-Password')
            if (!authHeader || authHeader !== pp) {
                return handleCORS(NextResponse.json({
                    error: 'Password required',
                    has_password: true,
                    client_name: clientData.name
                }, { status: 401 }))
            }
        }

        const tasks = await database.collection('tasks').find({ client_id: clientData.id }).sort({ category: 1, created_at: 1 }).toArray()
        const reports = await database.collection('reports').find({ client_id: clientData.id }).sort({ report_date: -1 }).toArray()
        const contentItems = await database.collection('content_items').find({ client_id: clientData.id }).sort({ created_at: -1 }).toArray()

        const cleanTasks = safeArray(tasks).map(({ _id, ...t }) => t)
        const cleanReports = safeArray(reports).map(({ _id, ...r }) => r)
        const cleanContent = safeArray(contentItems).map(({ _id, ...c }) => c)
        const resources = await database.collection('client_resources').find({ client_id: clientData.id }).sort({ created_at: -1 }).toArray()
        const cleanResources = safeArray(resources).map(({ _id, ...r }) => r)

        return handleCORS(NextResponse.json({
            client: clientData,
            tasks: cleanTasks,
            reports: cleanReports,
            content: cleanContent,
            resources: cleanResources
        }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
