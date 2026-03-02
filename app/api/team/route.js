import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'
import { validateBody } from '@/lib/validation'
import { TeamMemberSchema } from '@/lib/schemas/team.schema'

export const runtime = 'nodejs';

export async function GET(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const members = await database.collection('team_members').find({ is_active: { $ne: false } }).sort({ name: 1 }).toArray()
        const clean = members.map(({ _id, password_hash, ...m }) => m)
        return handleCORS(NextResponse.json(clean))
    })
}

export async function POST(request) {
    return withAuth(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()

        const validation = validateBody(TeamMemberSchema, body)
        if (!validation.success) {
            return handleCORS(NextResponse.json(validation.error, { status: 400 }))
        }

        const { name, email, role } = validation.data
        const id = uuidv4()

        const member = {
            id,
            name,
            email,
            role: role || 'SEO',
            is_active: true,
            created_at: new Date()
        }

        await database.collection('team_members').insertOne(member)
        return handleCORS(NextResponse.json(member))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
