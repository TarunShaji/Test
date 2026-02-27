import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'
import { applyTaskTransition, assertTaskInvariant } from '@/lib/lifecycleEngine'

export async function POST(request) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const database = await connectToMongo()
            const body = await request.json()
            const { tasks, client_id } = body

            if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
                return handleCORS(NextResponse.json({ error: 'Array of tasks required' }, { status: 400 }))
            }

            const preparedDocs = []
            const errors = []

            // 1. Prepare Batch in Memory (Single Authority Engine)
            for (let i = 0; i < tasks.length; i++) {
                const t = tasks[i]
                const title = t.title?.trim()
                const cid = t.client_id || client_id

                if (!title || !cid) {
                    errors.push({ index: i, error: 'Title and client_id are required' })
                    continue
                }

                try {
                    // Create base Doc
                    const baseDoc = {
                        id: t.id || uuidv4(),
                        client_id: cid,
                        title: title,
                        description: t.description || null,
                        category: t.category || 'Other',
                        priority: t.priority || 'P2',
                        assigned_to: t.assigned_to || null,
                        duration_days: t.duration_days || null,
                        eta_start: t.eta_start || null,
                        eta_end: t.eta_end || null,
                        remarks: t.remarks || null,
                        link_url: t.link_url || null,
                        // Expose intent to engine (which will validate/reject)
                        status: t.status || undefined,
                        internal_approval: t.internal_approval || undefined,
                        client_approval: t.client_approval || undefined,
                    }

                    // Use engine to compute initial lifecycle state + defaults
                    const finalDoc = applyTaskTransition(null, baseDoc);

                    // Add unique signature for idempotency
                    const signatureSource = `${cid}|${title}|${t.eta_end || ''}`
                    finalDoc.signature = crypto.createHash('sha256').update(signatureSource).digest('hex')

                    preparedDocs.push(finalDoc)
                } catch (err) {
                    errors.push({ index: i, error: `Lifecycle violation: ${err.message}` })
                }
            }

            if (preparedDocs.length === 0) {
                return handleCORS(NextResponse.json({
                    error: 'No valid tasks found in request',
                    details: errors
                }, { status: 400 }))
            }

            // 2. Multi-point Verification: Assert invariants for the entire batch before writing
            try {
                preparedDocs.forEach(doc => assertTaskInvariant(doc));
            } catch (criticalError) {
                return handleCORS(NextResponse.json({ error: `Batch Invariant Violation: ${criticalError.message}` }, { status: 400 }))
            }

            // 3. Atomic Bulk Write (Upsert based on signature)
            const operations = preparedDocs.map(doc => ({
                updateOne: {
                    filter: { signature: doc.signature },
                    update: { $setOnInsert: doc },
                    upsert: true
                }
            }))

            const bulkResult = await database.collection('tasks').bulkWrite(operations)

            return handleCORS(NextResponse.json({
                message: `Processed ${operations.length} tasks. New: ${bulkResult.upsertedCount}, Skipped: ${operations.length - bulkResult.upsertedCount}`,
                count: operations.length,
                inserted: bulkResult.upsertedCount,
                skipped: operations.length - bulkResult.upsertedCount,
                failed: errors.length,
                errors: errors
            }))
        })
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
