import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { safeArray } from '@/lib/safe'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const totalClients = await database.collection('clients').countDocuments({ is_active: true })
        const inProgress = await database.collection('tasks').countDocuments({ status: 'In Progress' })
        const toBeApproved = await database.collection('tasks').countDocuments({ status: 'Pending Review' })
        const blocked = await database.collection('tasks').countDocuments({ status: 'Blocked' })
        const completed = await database.collection('tasks').countDocuments({ status: 'Completed' })

        const recentTasks = await database.collection('tasks').find({}).sort({ updated_at: -1 }).limit(20).toArray()
        const recentTasksClean = safeArray(recentTasks).map(({ _id, ...t }) => t)

        const clientIds = [...new Set(recentTasksClean.map(t => t.client_id))]
        const clients = await database.collection('clients').find({ id: { $in: clientIds } }).toArray()
        const clientMap = Object.fromEntries(safeArray(clients).map(c => [c.id, c.name]))

        const enrichedRecent = recentTasksClean.map(t => ({ ...t, client_name: clientMap[t.client_id] || 'Unknown' }))

        return handleCORS(NextResponse.json({
            totalClients, inProgress, toBeApproved, blocked, completed,
            recentActivity: enrichedRecent
        }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
