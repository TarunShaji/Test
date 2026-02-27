import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS } from '@/lib/api-utils'

export async function POST(request, { params }) {
    try {
        const { slug } = params
        const body = await request.json()
        const { password } = body
        const database = await connectToMongo()

        const client = await database.collection('clients').findOne({ slug, is_active: true })
        if (!client) return handleCORS(NextResponse.json({ error: 'Client not found' }, { status: 404 }))

        if (!client.portal_password) return handleCORS(NextResponse.json({ success: true }))
        if (client.portal_password !== password) {
            return handleCORS(NextResponse.json({ error: 'Wrong password' }, { status: 401 }))
        }

        return handleCORS(NextResponse.json({ success: true }))
    } catch (error) {
        return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
    }
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
