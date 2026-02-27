import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth } from '@/lib/api-utils'

export async function PUT(request, { params }) {
    return withAuth(request, async () => {
        try {
            const { id: memberId } = params
            const database = await connectToMongo()
            const body = await request.json()

            const { _id, id, password_hash, password, ...updateData } = body
            if (password) updateData.password_hash = await bcrypt.hash(password, 10)
            updateData.updated_at = new Date()

            await database.collection('team_members').updateOne({ id: memberId }, { $set: updateData })
            const updated = await database.collection('team_members').findOne({ id: memberId })
            const { _id: _, password_hash: __, ...result } = updated

            return handleCORS(NextResponse.json(result))
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

            await database.collection('team_members').updateOne({ id: memberId }, { $set: { is_active: false } })
            return handleCORS(NextResponse.json({ message: 'Team member deactivated' }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
