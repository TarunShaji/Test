import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { applyContentTransition } from '@/lib/engine/lifecycle'
import { safeURL, safeArray } from '@/lib/safe'
import { validateBody } from '@/lib/middleware/validation'
import { ContentSchema } from '@/lib/db/schemas/content.schema'

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
        const enrich = url.searchParams.get('enrich') !== '0'

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

        // Single aggregation pipeline with $facet to compute count, stats, and paginated
        // data in one DB round-trip instead of 3 sequential queries.
        const sortStage = { $sort: { position: 1, created_at: -1 } }
        const [facetResult] = await collection.aggregate([
            { $match: query },
            {
                $facet: {
                    total: [{ $count: 'n' }],
                    stats: [{ $group: { _id: '$blog_status', count: { $sum: 1 } } }],
                    page: [sortStage, { $skip: skip }, { $limit: limit }]
                }
            }
        ]).toArray()

        const total = facetResult?.total?.[0]?.n || 0
        const totalPages = Math.ceil(total / limit)
        const statsArr = facetResult?.stats || []
        const statsMap = Object.fromEntries(statsArr.map(s => [s._id, s.count]))
        const content = facetResult?.page || []

        const clean = safeArray(content).map(({ _id, ...c }) => c)

        const data = enrich
            ? await (async () => {
                const clientIds = [...new Set(clean.map(c => c.client_id))]
                const clients = clientIds.length > 0
                    ? await database.collection('clients').find({ id: { $in: clientIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
                    : []
                const clientMap = Object.fromEntries(safeArray(clients).map(c => [c.id, c.name]))
                return clean.map(c => ({ ...c, client_name: clientMap[c.client_id] || 'Unknown' }))
            })()
            : clean

        return handleCORS(NextResponse.json({
            data,
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
