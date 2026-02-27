import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withAuth, withErrorLogging } from '@/lib/api-utils'

export async function GET(request) {
    return withErrorLogging(request, async () => {
        const database = await connectToMongo()
        const members = await database.collection('team_members').find({}).sort({ name: 1 }).toArray()
        const clean = members.map(({ _id, password_hash, ...m }) => m)
        return handleCORS(NextResponse.json(clean))
    })
}


export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
