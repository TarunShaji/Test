import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'
import { applyTaskTransition } from '@/lib/lifecycleEngine'

export async function GET(request) {
    return withErrorLogging(request, async () => {
        const database = await connectToMongo()
        const url = new URL(request.url)
        const query = {}

        const clientId = url.searchParams.get('client_id')
        const status = url.searchParams.get('status')
        const category = url.searchParams.get('category')
        const assignedTo = url.searchParams.get('assigned_to')
        const priority = url.searchParams.get('priority')

        if (clientId) query.client_id = clientId
        if (status) query.status = status
        if (category) query.category = category
        if (assignedTo) query.assigned_to = assignedTo
        if (priority) query.priority = priority

        const tasks = await database.collection('tasks').find(query).sort({ created_at: -1 }).toArray()
        const cleanTasks = tasks.map(({ _id, ...t }) => t)

        // Enrich with client names and assignee names
        const clientIds = [...new Set(cleanTasks.map(t => t.client_id))]
        const assigneeIds = [...new Set(cleanTasks.map(t => t.assigned_to).filter(Boolean))]

        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }).toArray() : []
        const members = assigneeIds.length > 0 ? await database.collection('team_members').find({ id: { $in: assigneeIds } }).toArray() : []

        const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
        const memberMap = Object.fromEntries(members.map(m => [m.id, m.name]))

        const enriched = cleanTasks.map(t => ({
            ...t,
            client_name: clientMap[t.client_id] || 'Unknown',
            assigned_to_name: memberMap[t.assigned_to] || null
        }))

        return handleCORS(NextResponse.json(enriched))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        try {
            const database = await connectToMongo()
            const body = await request.json()
            const { title, client_id } = body

            if (!title || !client_id) {
                return handleCORS(NextResponse.json({ error: 'title and client_id required' }, { status: 400 }))
            }

            const now = new Date()
            const initialTask = {
                id: uuidv4(),
                client_id,
                title,
                description: body.description || null,
                category: body.category || 'Other',
                status: body.status || 'To Be Started',
                priority: body.priority || 'P2',
                assigned_to: body.assigned_to || null,
                duration_days: body.duration_days || null,
                eta_start: body.eta_start || null,
                eta_end: body.eta_end || null,
                remarks: body.remarks || null,
                link_url: body.link_url || null,
                // Initial Lifecycle Base
                internal_approval: 'Pending',
                client_link_visible: false,
                client_approval: null,
                client_feedback_note: null,
                client_feedback_at: null,
                created_at: now,
                updated_at: now
            }

            // Apply lifecycle logic (mostly for non-defaults if provided)
            let finalTask;
            try {
                // For a new task, we treat the base as the initialTask and then apply any extra body overrides
                const { id, created_at, updated_at, ...bodyUpdates } = body;
                finalTask = { ...initialTask, ...applyTaskTransition(initialTask, bodyUpdates) };
            } catch (error) {
                return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
            }

            await database.collection('tasks').insertOne(finalTask)
            return handleCORS(NextResponse.json(finalTask))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
