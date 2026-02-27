import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'

export async function POST(request) {
    return withErrorLogging(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()
        const { name, email, role, password } = body

        if (!name || !email || !role || !password) {
            return handleCORS(NextResponse.json({ error: 'All fields (name, email, role, password) are required' }, { status: 400 }))
        }

        // 1. Check if email already exists
        const existing = await database.collection('team_members').findOne({ email: email.toLowerCase() })
        if (existing) {
            return handleCORS(NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 }))
        }

        // 2. Hash password
        const passwordHash = await bcrypt.hash(password, 10)

        // 3. Create member record
        const member = {
            id: uuidv4(),
            name,
            email: email.toLowerCase(),
            role,
            password_hash: passwordHash,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
        }

        await database.collection('team_members').insertOne(member)

        // 4. Return success (sanitize password_hash)
        const { _id, password_hash: _, ...result } = member
        return handleCORS(NextResponse.json({
            message: 'Registration successful',
            user: result
        }, { status: 201 }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
