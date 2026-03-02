import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'
import { applyTaskTransition, assertTaskInvariant } from '@/lib/lifecycleEngine'

import { TaskCreateSchema } from '@/lib/schemas/task.schema'
import { validateBody } from '@/lib/validation'
import { z } from 'zod'

export async function POST(request) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const database = await connectToMongo()
            const body = await request.json()
            const { tasks, client_id } = body

            // Explicit import schema — does NOT inherit .strict() from TaskCreateSchema.
            // Unknown fields are stripped, not rejected. This avoids 400s from extra columns.
            const TaskImportItemSchema = z.object({
                title: z.string().min(1),
                client_id: z.string().optional().nullable(),
                status: z.string().optional().nullable(),
                category: z.string().optional().nullable(),
                priority: z.string().optional().nullable(),
                link_url: z.string().optional().nullable(),
                assigned_to: z.string().optional().nullable(),
                eta_end: z.string().optional().nullable(),
                eta_start: z.string().optional().nullable(),
                duration_days: z.string().optional().nullable(),
                remarks: z.string().optional().nullable(),
                internal_approval: z.string().optional().nullable(),
                client_feedback_note: z.string().optional().nullable(),
            }) // no .strict() — unknown keys are stripped by default

            const validation = validateBody(z.object({
                tasks: z.array(TaskImportItemSchema),
                client_id: z.string().uuid()
            }), body)

            if (!validation.success) {
                console.error('[tasks/bulk] Validation failed:', JSON.stringify(validation.error))
                return handleCORS(NextResponse.json(validation.error, { status: 400 }))
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

export async function DELETE(request) {
    return withAuth(request, async () => {
        return withErrorLogging(request, async () => {
            const database = await connectToMongo()
            const body = await request.json()
            const { ids } = body

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return handleCORS(NextResponse.json({ error: 'IDs array is required' }, { status: 400 }))
            }

            const result = await database.collection('tasks').deleteMany({ id: { $in: ids } })

            return handleCORS(NextResponse.json({
                message: `Successfully deleted ${result.deletedCount} tasks`,
                count: result.deletedCount
            }))
        })
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
