import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/middleware/api-utils'
import { safeArray, safeURL } from '@/lib/safe'
import bcrypt from 'bcryptjs'

export const runtime = 'nodejs';

export async function GET(request, { params }) {
    return withErrorLogging(request, async () => {
        const { slug } = params
        const database = await connectToMongo()
        const url = safeURL(request.url)
        const includeParam = url?.searchParams?.get('include') || 'client,tasks,reports,content,resources'
        const include = new Set(includeParam.split(',').map((s) => s.trim()).filter(Boolean))
        const service = (url?.searchParams?.get('service') || 'all').toLowerCase()
        const client = await database.collection('clients').findOne({ slug, is_active: true })

        if (!client) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        const { _id, portal_password: pp, ...clientData } = client
        const hasPassword = !!pp

        if (hasPassword) {
            const authHeader = request.headers.get('X-Portal-Password')
            let valid = false
            if (authHeader) {
                try {
                    // Primary path: bcrypt hash in DB
                    valid = await bcrypt.compare(authHeader, pp)
                } catch {
                    // Legacy fallback for old plaintext records
                    valid = authHeader === pp
                }
            }
            if (!valid) {
                return handleCORS(NextResponse.json({
                    error: 'Password required',
                    has_password: true,
                    client_name: clientData.name
                }, { status: 401 }))
            }
        }

        const response = {}
        if (include.has('client')) {
            response.client = clientData
        }

        if (include.has('tasks')) {
            let allTasks = []
            if (service === 'seo' || service === 'all') {
                const seoTasks = await database.collection('tasks').find({ client_id: clientData.id }).sort({ category: 1, created_at: 1 }).toArray()
                allTasks = allTasks.concat(safeArray(seoTasks).map(({ _id, ...t }) => ({ ...t, service: 'seo' })))
            }
            if (service === 'email' || service === 'all') {
                const emailTasks = await database.collection('email_tasks').find({ client_id: clientData.id }).sort({ created_at: 1 }).toArray()
                allTasks = allTasks.concat(safeArray(emailTasks).map(({ _id, ...t }) => ({ ...t, service: 'email' })))
            }
            if (service === 'paid' || service === 'all') {
                const paidTasks = await database.collection('paid_tasks').find({ client_id: clientData.id }).sort({ created_at: 1 }).toArray()
                allTasks = allTasks.concat(safeArray(paidTasks).map(({ _id, ...t }) => ({ ...t, service: 'paid' })))
            }
            response.tasks = allTasks
        }

        if (include.has('reports')) {
            const reports = await database.collection('reports').find({ client_id: clientData.id }).sort({ report_date: -1 }).toArray()
            response.reports = safeArray(reports).map(({ _id, ...r }) => r)
        }

        if (include.has('content')) {
            const contentItems = await database.collection('content_items').find({ client_id: clientData.id }).sort({ week: 1, created_at: 1 }).toArray()
            response.content = safeArray(contentItems).map(({ _id, ...c }) => c)
        }

        if (include.has('resources')) {
            const resources = await database.collection('client_resources').find({ client_id: clientData.id }).sort({ created_at: -1 }).toArray()
            response.resources = safeArray(resources).map(({ _id, ...r }) => r)
        }

        return handleCORS(NextResponse.json(response))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
