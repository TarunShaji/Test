import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { applyContentTransition } from '@/lib/lifecycleEngine'
import { safeURL, safeArray } from '@/lib/safe'
import { validateBody } from '@/lib/validation'
import { ContentSchema } from '@/lib/schemas/content.schema'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const url = safeURL(request.url)
        const query = {}

        const clientId = url.searchParams.get('client_id')
        const week = url.searchParams.get('week')
        const writer = url.searchParams.get('writer')
        const topicApproval = url.searchParams.get('topic_approval')
        const blogStatus = url.searchParams.get('blog_status')
        const internalApproval = url.searchParams.get('internal_approval')
        const clientApproval = url.searchParams.get('client_approval')
        const published = url.searchParams.get('published') // 'yes' or 'no'
        const search = url.searchParams.get('search')

        // Pagination Params
        const page = parseInt(url.searchParams.get('page')) || 1
        const limit = parseInt(url.searchParams.get('limit')) || 50
        const skip = (page - 1) * limit

        if (clientId) query.client_id = clientId
        if (week) query.week = week
        if (writer) query.writer = { $regex: writer, $options: 'i' }
        if (topicApproval) query.topic_approval_status = topicApproval
        if (blogStatus) query.blog_status = blogStatus
        if (internalApproval) query.blog_internal_approval = internalApproval
        if (clientApproval) query.blog_approval_status = clientApproval
        if (published) {
            query.published_date = published === 'yes' ? { $exists: true, $ne: null } : { $in: [null, ""] }
        }
        if (search) {
            query.blog_title = { $regex: search, $options: 'i' }
        }

        const collection = database.collection('content_items')
        const total = await collection.countDocuments(query)
        const totalPages = Math.ceil(total / limit)

        // Calculate stats for the current filter (but without pagination)
        const statsQuery = { ...query }
        const stats = await collection.aggregate([
            { $match: statsQuery },
            { $group: { _id: "$blog_status", count: { $sum: 1 } } }
        ]).toArray()

        const statsMap = Object.fromEntries(stats.map(s => [s._id, s.count]))

        const content = await collection.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .toArray()

        const clean = safeArray(content).map(({ _id, ...c }) => c)

        // Enrich with client names
        const clientIds = [...new Set(clean.map(c => c.client_id))]
        const clients = clientIds.length > 0 ? await database.collection('clients').find({ id: { $in: clientIds } }).toArray() : []
        const clientMap = Object.fromEntries(safeArray(clients).map(c => [c.id, c.name]))
        const enriched = clean.map(c => ({ ...c, client_name: clientMap[c.client_id] || 'Unknown' }))

        return handleCORS(NextResponse.json({
            data: enriched,
            total,
            page,
            totalPages,
            stats: {
                drafts: statsMap['Draft'] || 0,
                inProgress: statsMap['In Progress'] || 0,
                published: statsMap['Published'] || 0,
                sentForApproval: statsMap['Sent for Approval'] || 0
            }
        }))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()

        const validation = validateBody(ContentSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const cleanData = validation.data
        const { blog_title, client_id } = cleanData

        const item = applyContentTransition(null, {
            id: uuidv4(),
            client_id,
            blog_title,
            ...cleanData
        });

        await database.collection('content_items').insertOne(item)
        return handleCORS(NextResponse.json(item))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
