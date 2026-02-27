import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'

export async function POST(request) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const database = await connectToMongo()
            const body = await request.json()
            const { tasks, client_id } = body

            if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
                return handleCORS(NextResponse.json({ error: 'Array of tasks required' }, { status: 400 }))
            }

            const now = new Date()
            const operations = []
            const errors = []

            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i]
                const title = t.title?.trim()
                const cid = t.client_id || client_id

                if (!title || !cid) {
                    errors.push({ index: i, error: 'Title and client_id are required' })
                    continue
                }

                // Generate a unique signature for idempotency
                const signatureSource = `${cid}|${title}|${t.eta_end || ''}`
                const signature = crypto.createHash('sha256').update(signatureSource).digest('hex')

                const taskDoc = {
                    id: t.id || uuidv4(),
                    client_id: cid,
                    title: title,
                    description: t.description || null,
                    category: t.category || 'Other',
                    status: t.status || 'To Be Started',
                    priority: t.priority || 'P2',
                    assigned_to: t.assigned_to || null,
                    duration_days: t.duration_days || null,
                    eta_start: t.eta_start || null,
                    eta_end: t.eta_end || null,
                    remarks: t.remarks || null,
                    link_url: t.link_url || null,
                    signature: signature,
                    // Hardened Lifecycle Defaults
                    internal_approval: 'Pending',
                    client_link_visible: false,
                    client_approval: null,
                    client_feedback_note: null,
                    client_feedback_at: null,
                    created_at: now,
                    updated_at: now
                }

                operations.push({
                    updateOne: {
                        filter: { signature: signature },
                        update: { $setOnInsert: taskDoc },
                        upsert: true
                    }
                })
            }

            if (operations.length === 0) {
                return handleCORS(NextResponse.json({
                    error: 'No valid tasks found in request',
                    details: errors
                }, { status: 400 }))
            }

            const result = await database.collection('tasks').bulkWrite(operations)

            return handleCORS(NextResponse.json({
                message: `Processed ${operations.length} tasks. New: ${result.upsertedCount}, Skipped: ${operations.length - result.upsertedCount}`,
                count: operations.length,
                inserted: result.upsertedCount,
                skipped: operations.length - result.upsertedCount,
                failed: errors.length,
                errors: errors
            }))
        })
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
