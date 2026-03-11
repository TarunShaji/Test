import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db/mongodb'
import { handleCORS, withAuth } from '@/lib/middleware/api-utils'
import { validateBody } from '@/lib/middleware/validation'
import { TeamMemberSchema } from '@/lib/db/schemas/team.schema'
import bcrypt from 'bcryptjs'

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: memberId } = params
            const database = await connectToMongo()
            const body = await request.json()

            const validation = validateBody(TeamMemberSchema, body)
            if (!validation.success) {
                return handleCORS(NextResponse.json(validation.error, { status: 400 }))
            }

            const updateData = validation.data
            if (Object.prototype.hasOwnProperty.call(updateData, 'password')) {
                if (updateData.password) {
                    updateData.password_hash = await bcrypt.hash(updateData.password, 10)
                }
                delete updateData.password
            }
            updateData.updated_at = new Date()

            const result = await database.collection('team_members').updateOne(
                { id: memberId },
                { $set: updateData }
            )

            if (result.matchedCount === 0) {
                return handleCORS(NextResponse.json({ error: 'Team member not found' }, { status: 404 }))
            }

            const updated = await database.collection('team_members').findOne({ id: memberId })
            const { _id, password_hash, ...responseBody } = updated

            return handleCORS(NextResponse.json(responseBody))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function DELETE(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: memberId } = params
            const database = await connectToMongo()

            const result = await database.collection('team_members').updateOne(
                { id: memberId },
                { $set: { is_active: false, updated_at: new Date() } }
            )

            if (result.matchedCount === 0) {
                return handleCORS(NextResponse.json({ error: 'Team member not found' }, { status: 404 }))
            }

            return handleCORS(NextResponse.json({ message: 'Team member deactivated' }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
