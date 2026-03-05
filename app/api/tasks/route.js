import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { applyTaskTransition, assertTaskInvariant } from '@/lib/engine/lifecycle'
import { safeURL, safeArray } from '@/lib/safe'
import { validateBody, rejectFields } from '@/lib/middleware/validation'
import { TaskCreateSchema } from '@/lib/db/schemas/task.schema'

export const runtime = 'nodejs';

const FORBIDDEN_FIELDS = [
    'internal_approval',
    'client_link_visible',
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
        const category = url.searchParams.get('category')
        const assignedTo = url.searchParams.get('assigned_to')
        const priority = url.searchParams.get('priority')
        const search = url.searchParams.get('search')

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
        if (category) query.category = category
        if (assignedTo) query.assigned_to = assignedTo
        if (priority) query.priority = priority
        if (search) {
            query.title = { $regex: search, $options: 'i' }
        }

        const collection = database.collection('tasks')
        const total = await collection.countDocuments(query)
        const totalPages = Math.ceil(total / limit)

        const tasks = await collection.find(query)
            .sort({ position: 1, created_at: -1 })
            .skip(skip)
            .limit(limit)
            .toArray()

        const cleanTasks = safeArray(tasks).map(({ _id, ...t }) => t)

        // Enrich with client names and assignee names
        const clientIds = [...new Set(cleanTasks.map(t => t.client_id))]
        const assigneeIds = [...new Set(cleanTasks.map(t => t.assigned_to).filter(Boolean))]

        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }).toArray() : []
        const members = assigneeIds.length > 0 ? await database.collection('team_members').find({ id: { $in: assigneeIds } }).toArray() : []

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
        const validation = validateBody(TaskCreateSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data

        // 3. Engine-Backed Creation
        const finalTask = applyTaskTransition(null, {
            ...cleanData,
            id: uuidv4()
        });

        // 4. Persistence
        await database.collection('tasks').insertOne(finalTask)

        // 5. Post-Insert Verification
        assertTaskInvariant(finalTask);

        return handleCORS(NextResponse.json(finalTask))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
