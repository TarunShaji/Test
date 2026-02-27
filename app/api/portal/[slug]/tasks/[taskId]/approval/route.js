import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'
import { applyTaskTransition } from '@/lib/lifecycleEngine'

export async function PUT(request, { params }) {
    return withErrorLogging(request, async () => {
        const { slug, taskId } = params
        const body = await request.json()
        const { client_approval, client_feedback_note } = body
        const database = await connectToMongo()

        const VALID = ['Pending Review', 'Approved', 'Required Changes']
        if (!VALID.includes(client_approval)) {
            return handleCORS(NextResponse.json({ error: 'Invalid approval value' }, { status: 400 }))
        }

        const clientDoc = await database.collection('clients').findOne({ slug, is_active: true })
        if (!clientDoc) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        // Security check
        if (clientDoc.portal_password) {
            const authHeader = request.headers.get('X-Portal-Password')
            if (!authHeader || authHeader !== clientDoc.portal_password) {
                return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
            }
        }

        const task = await database.collection('tasks').findOne({ id: taskId, client_id: clientDoc.id })
        if (!task) return handleCORS(NextResponse.json({ error: 'Task not found' }, { status: 404 }))

        // Mandatory feedback check for changes
        if (client_approval === 'Required Changes' && (!client_feedback_note || client_feedback_note.trim() === '')) {
            return handleCORS(NextResponse.json({ error: 'Feedback note is required for changes' }, { status: 400 }))
        }

        // Apply centralized lifecycle logic
        let finalUpdate;
        try {
            const updates = { client_approval, client_feedback_note };
            finalUpdate = applyTaskTransition(task, updates);
        } catch (error) {
            return handleCORS(NextResponse.json({ error: error.message }, { status: 400 }))
        }

        await database.collection('tasks').updateOne(
            { id: taskId },
            { $set: finalUpdate }
        )

        return handleCORS(NextResponse.json({ success: true, ...finalUpdate }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
