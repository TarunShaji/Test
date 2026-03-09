import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { safeArray } from '@/lib/safe'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()

        const members = await database
            .collection('team_members')
            .find({ is_active: { $ne: false } })
            .sort({ name: 1 })
            .toArray()

        const cleanMembers = safeArray(members).map(({ _id, password_hash, ...m }) => m)
        const memberIds = cleanMembers.map((m) => m.id)

        if (memberIds.length === 0) {
            return handleCORS(NextResponse.json([]))
        }

        const byMember = Object.fromEntries(memberIds.map((id) => [
            id,
            {
                total_tasks: 0,
                active_tasks: 0
            }
        ]))

        const aggregation = [
            { $match: { assigned_to: { $in: memberIds } } },
            {
                $group: {
                    _id: '$assigned_to',
                    total: { $sum: 1 },
                    active: {
                        $sum: { $cond: [{ $ne: ['$status', 'Completed'] }, 1, 0] }
                    }
                }
            }
        ]

        const [seoCounts, emailCounts, paidCounts] = await Promise.all([
            database.collection('tasks').aggregate(aggregation).toArray(),
            database.collection('email_tasks').aggregate(aggregation).toArray(),
            database.collection('paid_tasks').aggregate(aggregation).toArray(),
        ])

        for (const row of [...safeArray(seoCounts), ...safeArray(emailCounts), ...safeArray(paidCounts)]) {
            if (!byMember[row._id]) continue
            byMember[row._id].total_tasks += row.total || 0
            byMember[row._id].active_tasks += row.active || 0
        }

        const response = cleanMembers.map((member) => ({
            ...member,
            workload: byMember[member.id] || {
                total_tasks: 0,
                active_tasks: 0
            }
        }))

        return handleCORS(NextResponse.json(response))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
