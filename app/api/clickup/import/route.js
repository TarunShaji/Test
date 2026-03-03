import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'

export const runtime = 'nodejs';

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()
        const { token, list_ids, client_id, members = [] } = body
        if (!token || !list_ids?.length || !client_id) {
            return handleCORS(NextResponse.json({ error: 'token, list_ids, client_id required' }, { status: 400 }))
        }

        const headers = { 'Authorization': token, 'Content-Type': 'application/json' }
        const CU_STATUS = {
            'to do': 'To Be Started', 'open': 'To Be Started', 'not started': 'To Be Started',
            'in progress': 'In Progress', 'active': 'In Progress',
            'in review': 'Pending Review', 'review': 'Pending Review', 'approval': 'Pending Review',
            'complete': 'Completed', 'done': 'Completed', 'closed': 'Completed',
            'blocked': 'Blocked', 'on hold': 'Blocked',
            'recurring': 'Recurring',
        }
        const mapStatus = (s) => CU_STATUS[s?.toLowerCase()?.trim()] || 'To Be Started'
        const membersByName = Object.fromEntries(members.map(m => [m.name.toLowerCase(), m.id]))

        let imported = 0, skipped = 0, errors = []

        for (const listId of list_ids) {
            let page = 0
            while (true) {
                const tasksResp = await fetch(
                    `https://api.clickup.com/api/v2/list/${listId}/task?archived=false&include_closed=true&page=${page}&limit=100`,
                    { headers }
                )
                if (!tasksResp.ok) { errors.push(`List ${listId} failed`); break }
                const tasksData = await tasksResp.json()
                const tasks = tasksData.tasks || []
                if (tasks.length === 0) break

                for (const t of tasks) {
                    try {
                        const assigneeName = t.assignees?.[0]?.username || t.assignees?.[0]?.email?.split('@')[0] || null
                        const assignedTo = assigneeName ? (membersByName[assigneeName.toLowerCase()] || null) : null

                        let etaEnd = null
                        if (t.due_date) {
                            try { etaEnd = new Date(parseInt(t.due_date)).toISOString().split('T')[0] } catch { }
                        }

                        const taskDoc = {
                            id: uuidv4(),
                            client_id,
                            title: t.name || 'Untitled',
                            description: t.description || null,
                            category: 'Other',
                            status: mapStatus(t.status?.status || 'to do'),
                            priority: 'P2',
                            assigned_to: assignedTo,
                            duration_days: null,
                            eta_start: null,
                            eta_end: etaEnd,
                            remarks: null,
                            link_url: t.url || null,
                            clickup_id: t.id,
                            created_at: new Date(),
                            updated_at: new Date()
                        }
                        await database.collection('tasks').insertOne(taskDoc)
                        imported++
                    } catch (e) {
                        errors.push(`Task ${t.id}: ${e.message}`)
                        skipped++
                    }
                }
                if (tasks.length < 100) break
                page++
                await new Promise(r => setTimeout(r, 100))
            }
        }

        return handleCORS(NextResponse.json({ imported, skipped, errors: errors.slice(0, 10) }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
