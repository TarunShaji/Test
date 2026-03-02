import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging, verifyToken } from '@/lib/api-utils'

export const runtime = 'nodejs';

export async function POST(request) {
    return withErrorLogging(request, async () => {
        const user = verifyToken(request)
        if (!user || user.role !== 'Admin') {
            return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
        }

        const database = await connectToMongo()
        const body = await request.json()
        const { old_email, new_email } = body

        await database.collection('team_members').updateOne({ email: old_email }, { $set: { email: new_email } })
        return handleCORS(NextResponse.json({ message: 'Email updated' }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
