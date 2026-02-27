import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'

export async function PUT(request, { params }) {
    return withErrorLogging(request, async () => {
        const { slug, contentId } = params
        const body = await request.json()
        const { topic_approval_status, blog_approval_status } = body
        const database = await connectToMongo()

        const VALID_TOPIC = ['Pending', 'Approved', 'Rejected']
        const VALID_BLOG = ['Pending Review', 'Approved', 'Changes Required']

        const clientDoc = await database.collection('clients').findOne({ slug, is_active: true })
        if (!clientDoc) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        // Security check
        if (clientDoc.portal_password) {
            const authHeader = request.headers.get('X-Portal-Password')
            if (!authHeader || authHeader !== clientDoc.portal_password) {
                return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
            }
        }

        const item = await database.collection('content_items').findOne({ id: contentId, client_id: clientDoc.id })
        if (!item) return handleCORS(NextResponse.json({ error: 'Content item not found' }, { status: 404 }))

        const updateData = { updated_at: new Date() }
        if (topic_approval_status && VALID_TOPIC.includes(topic_approval_status)) {
            updateData.topic_approval_status = topic_approval_status
            if (topic_approval_status === 'Approved') {
                updateData.topic_approval_date = new Date().toISOString().split('T')[0]
            }
        }
        if (blog_approval_status && VALID_BLOG.includes(blog_approval_status)) {
            updateData.blog_approval_status = blog_approval_status
            if (blog_approval_status === 'Approved') {
                updateData.blog_approval_date = new Date().toISOString().split('T')[0]
            }
        }

        await database.collection('content_items').updateOne({ id: contentId }, { $set: updateData })
        return handleCORS(NextResponse.json({ success: true, ...updateData }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
