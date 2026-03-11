import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { validateBody } from '@/lib/middleware/validation'
import { TeamMemberSchema } from '@/lib/db/schemas/team.schema'
import bcrypt from 'bcryptjs'

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

        const { name, email, role, password } = validation.data
        if (!password) {
            return handleCORS(NextResponse.json({
                error: 'Password is required when creating a team member'
            }, { status: 400 }))
        }

        const existing = await database.collection('team_members').findOne({ email: email.toLowerCase() })
        if (existing) {
            return handleCORS(NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 }))
        }

        const id = uuidv4()
        const password_hash = await bcrypt.hash(password, 10)

        const member = {
            id,
            name,
            email: email.toLowerCase(),
            password_hash,
            role: role || 'SEO',
            is_active: true,
            created_at: new Date()
        }

        await database.collection('team_members').insertOne(member)
        const { password_hash: _, ...safeMember } = member
        return handleCORS(NextResponse.json(safeMember))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
