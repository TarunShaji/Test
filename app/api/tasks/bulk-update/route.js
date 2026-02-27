import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyTaskTransition } from '@/lib/lifecycleEngine'

export async function POST(request) {
    return withAuth(request, async () => {
        try {
            const database = await connectToMongo()
            const body = await request.json()
            const { task_ids, updates } = body

            if (!task_ids || !updates || !Array.isArray(task_ids)) {
                return handleCORS(NextResponse.json({ error: 'task_ids array and updates required' }, { status: 400 }))
            }

            // Fetch current tasks to apply individual transitions
            const tasks = await database.collection('tasks').find({ id: { $in: task_ids } }).toArray()

            const results = []
            const errors = []

            for (const task of tasks) {
                try {
                    const finalUpdate = applyTaskTransition(task, updates)
                    await database.collection('tasks').updateOne(
                        { id: task.id },
                        { $set: finalUpdate }
                    )
                    results.push(task.id)
                } catch (error) {
                    errors.push({ id: task.id, error: error.message })
                }
            }

            return handleCORS(NextResponse.json({
                message: `Updated ${results.length} tasks`,
                updated: results.length,
                failed: errors.length,
                errors: errors.length > 0 ? errors : undefined
            }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
