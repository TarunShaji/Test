import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { safeArray } from '@/lib/safe'

export const runtime = 'nodejs';

function shapeTask(task, clientMap) {
    return {
        id: task.id,
        title: task.title,
        status: task.status,
        client_name: clientMap[task.client_id] || 'Unknown'
    }
}

export async function GET(request, { params }) {
    return withAuth(request, async () => {
        const { id: memberId } = params
        const database = await connectToMongo()

        const member = await database.collection('team_members').findOne({ id: memberId, is_active: { $ne: false } })
        if (!member) {
            return handleCORS(NextResponse.json({ error: 'Team member not found' }, { status: 404 }))
        }

        const query = { assigned_to: memberId }
        const projection = { _id: 0, id: 1, title: 1, status: 1, client_id: 1 }

        const [seoTasks, emailTasks, paidTasks] = await Promise.all([
            database.collection('tasks').find(query, { projection }).sort({ updated_at: -1, created_at: -1 }).toArray(),
            database.collection('email_tasks').find(query, { projection }).sort({ updated_at: -1, created_at: -1 }).toArray(),
            database.collection('paid_tasks').find(query, { projection }).sort({ updated_at: -1, created_at: -1 }).toArray(),
        ])

        const allTasks = [...safeArray(seoTasks), ...safeArray(emailTasks), ...safeArray(paidTasks)]
        const clientIds = [...new Set(allTasks.map((t) => t.client_id).filter(Boolean))]
        const clients = clientIds.length
            ? await database.collection('clients').find({ id: { $in: clientIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
            : []
        const clientMap = Object.fromEntries(safeArray(clients).map((c) => [c.id, c.name]))

        return handleCORS(NextResponse.json({
            services: {
                seo: safeArray(seoTasks).map((t) => shapeTask(t, clientMap)),
                email: safeArray(emailTasks).map((t) => shapeTask(t, clientMap)),
                paid: safeArray(paidTasks).map((t) => shapeTask(t, clientMap)),
            }
        }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
