import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, verifyToken } from '@/lib/api-utils'

export async function POST(request) {
    try {
        const user = verifyToken(request)
        if (!user || user.role !== 'Admin') {
            return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
        }

        const database = await connectToMongo()
        const body = await request.json()
        const { old_email, new_email } = body

        await database.collection('team_members').updateOne({ email: old_email }, { $set: { email: new_email } })
        return handleCORS(NextResponse.json({ message: 'Email updated' }))
    } catch (error) {
        return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
    }
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
