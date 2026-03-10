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

        // Build parallel fetch promises for all requested sections
        const fetchPromises = {}

        if (include.has('tasks')) {
            // All 3 service collections in parallel
            fetchPromises.seoTasks = (service === 'seo' || service === 'all')
                ? database.collection('tasks').find({ client_id: clientData.id }).sort({ category: 1, created_at: 1 }).toArray()
                : Promise.resolve([])
            fetchPromises.emailTasks = (service === 'email' || service === 'all')
                ? database.collection('email_tasks').find({ client_id: clientData.id }).sort({ created_at: 1 }).toArray()
                : Promise.resolve([])
            fetchPromises.paidTasks = (service === 'paid' || service === 'all')
                ? database.collection('paid_tasks').find({ client_id: clientData.id }).sort({ created_at: 1 }).toArray()
                : Promise.resolve([])
        }

        if (include.has('reports')) {
            fetchPromises.reports = database.collection('reports').find({ client_id: clientData.id }).sort({ report_date: -1 }).toArray()
        }

        if (include.has('content')) {
            fetchPromises.content = database.collection('content_items').find({ client_id: clientData.id }).sort({ week: 1, created_at: 1 }).toArray()
        }

        if (include.has('resources')) {
            fetchPromises.resources = database.collection('client_resources').find({ client_id: clientData.id }).sort({ created_at: -1 }).toArray()
        }

        // Execute all promises in parallel
        const keys = Object.keys(fetchPromises)
        const results = await Promise.all(keys.map(k => fetchPromises[k]))
        const resolved = Object.fromEntries(keys.map((k, i) => [k, results[i]]))

        if (include.has('tasks')) {
            const seoTasks = safeArray(resolved.seoTasks).map(({ _id, ...t }) => ({ ...t, service: 'seo' }))
            const emailTasks = safeArray(resolved.emailTasks).map(({ _id, ...t }) => ({ ...t, service: 'email' }))
            const paidTasks = safeArray(resolved.paidTasks).map(({ _id, ...t }) => ({ ...t, service: 'paid' }))
            response.tasks = [...seoTasks, ...emailTasks, ...paidTasks]
        }

        if (include.has('reports')) {
            response.reports = safeArray(resolved.reports).map(({ _id, ...r }) => r)
        }

        if (include.has('content')) {
            response.content = safeArray(resolved.content).map(({ _id, ...c }) => c)
        }

        if (include.has('resources')) {
            response.resources = safeArray(resolved.resources).map(({ _id, ...r }) => r)
        }

        return handleCORS(NextResponse.json(response))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
