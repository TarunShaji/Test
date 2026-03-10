import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { applyTaskTransition, assertTaskInvariant } from '@/lib/engine/lifecycle'
import { safeURL, safeArray } from '@/lib/safe'
import { validateBody, rejectFields } from '@/lib/middleware/validation'
import { PaidTaskSchema } from '@/lib/db/schemas/paid.schema'
import { getActiveTeamMemberIdSet, normalizeAssignedTo } from '@/lib/team/assignee'

export const runtime = 'nodejs';

const FORBIDDEN_FIELDS = [
    'internal_approval',
    'client_approval',
    'client_feedback_note',
    'client_feedback_at'
];

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const url = safeURL(request.url)
        const query = {}

        const clientId = url.searchParams.get('client_id')
        const status = url.searchParams.get('status')
        const assignedTo = url.searchParams.get('assigned_to')
        const search = url.searchParams.get('search')
        const enrich = url.searchParams.get('enrich') !== '0'

        // Pagination Params
        const page = parseInt(url.searchParams.get('page')) || 1
        const limit = parseInt(url.searchParams.get('limit')) || 50
        const skip = (page - 1) * limit

        if (clientId) query.client_id = clientId
        if (status) {
            if (status === 'not_completed') {
                query.status = { $ne: 'Completed' }
            } else {
                query.status = status
            }
        }
        if (assignedTo) query.assigned_to = assignedTo
        if (search) {
            query.title = { $regex: search, $options: 'i' }
        }

        const collection = database.collection('paid_tasks')
        const [total, tasks] = await Promise.all([
            collection.countDocuments(query),
            collection.find(query)
                .sort({ position: 1, created_at: -1 })
                .skip(skip)
                .limit(limit)
                .toArray()
        ])
        const totalPages = Math.ceil(total / limit)

        const cleanTasks = safeArray(tasks).map(({ _id, ...t }) => t)

        if (!enrich) {
            return handleCORS(NextResponse.json({
                data: cleanTasks,
                total,
                page,
                totalPages
            }))
        }

        // Enrich with client names and assignee names only when requested.
        const clientIds = [...new Set(cleanTasks.map(t => t.client_id))]
        const assigneeIds = [...new Set(cleanTasks.map(t => t.assigned_to).filter(Boolean))]
        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray() : []
        const members = assigneeIds.length > 0 ? await database.collection('team_members').find({ id: { $in: assigneeIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray() : []
        const clientMap = Object.fromEntries(safeArray(clients).map(c => [c.id, c.name]))
        const memberMap = Object.fromEntries(safeArray(members).map(m => [m.id, m.name]))
        const enriched = cleanTasks.map(t => ({
            ...t,
            client_name: clientMap[t.client_id] || 'Unknown',
            assigned_to_name: memberMap[t.assigned_to] || null
        }))

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

        // 1. Mutation Isolation: Reject injection of lifecycle fields on creation
        const rejection = rejectFields(body, FORBIDDEN_FIELDS)
        if (!rejection.success) {
            return handleCORS(NextResponse.json(rejection.error, { status: 400 }))
        }

        // 2. Schema Validation
        const validation = validateBody(PaidTaskSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data
        const validMemberIds = await getActiveTeamMemberIdSet(database)
        const assignedTo = normalizeAssignedTo(cleanData.assigned_to, validMemberIds)

        // 3. Engine-Backed Creation
        const finalTask = applyTaskTransition(null, {
            ...cleanData,
            ...(assignedTo !== undefined ? { assigned_to: assignedTo } : {}),
            id: uuidv4()
        });

        // 4. Persistence
        await database.collection('paid_tasks').insertOne(finalTask)

        // 5. Post-Insert Verification
        assertTaskInvariant(finalTask);

        return handleCORS(NextResponse.json(finalTask))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
