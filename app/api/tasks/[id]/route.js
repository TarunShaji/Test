import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyTaskTransition } from '@/lib/lifecycleEngine'

export async function GET(request, { params }) {
    try {
        const { id: taskId } = params
        const database = await connectToMongo()
        const task = await database.collection('tasks').findOne({ id: taskId })
        if (!task) return handleCORS(NextResponse.json({ error: 'Task not found' }, { status: 404 }))
        const { _id, ...result } = task
        return handleCORS(NextResponse.json(result))
    } catch (error) {
        return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
    }
}

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: taskId } = params
            const database = await connectToMongo()
            const body = await request.json()

            // Fetch current state
            const current = await database.collection('tasks').findOne({ id: taskId })
            if (!current) return handleCORS(NextResponse.json({ error: 'Task not found' }, { status: 404 }))

            // Concurrency Control: Optimistic Locking
            // If the client sends an updated_at, we ensure it matches the DB
            if (body.updated_at && current.updated_at) {
                const clientTime = new Date(body.updated_at).getTime()
                const dbTime = new Date(current.updated_at).getTime()
                if (clientTime < dbTime) {
                    return handleCORS(NextResponse.json({
                        error: 'Concurrency error: Task has been modified by another user',
                        current: current
                    }, { status: 409 }))
                }
            }

            const { _id, id, updated_at, created_at, ...cleanUpdate } = body

            // Apply centralized lifecycle logic
            let finalUpdate;
            try {
                finalUpdate = applyTaskTransition(current, cleanUpdate);
            } catch (transitionError) {
                return handleCORS(NextResponse.json({ error: transitionError.message }, { status: 400 }))
            }

            await database.collection('tasks').updateOne(
                { id: taskId },
                { $set: finalUpdate }
            )

            const updated = await database.collection('tasks').findOne({ id: taskId })
            const { _id: _, ...result } = updated

            return handleCORS(NextResponse.json(result))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function DELETE(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: taskId } = params
            const database = await connectToMongo()

            await database.collection('tasks').deleteOne({ id: taskId })
            return handleCORS(NextResponse.json({ message: 'Task deleted' }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
