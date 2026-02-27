import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { connectToMongo } from '@/lib/mongodb'
import { handleCORS, withErrorLogging, verifyToken } from '@/lib/api-utils'

const JWT_SECRET = process.env.JWT_SECRET

export async function POST(request) {
    return withErrorLogging(request, async () => {
        const database = await connectToMongo()
        const body = await request.json()
        const { email, password } = body

        if (!email || !password) {
            return handleCORS(NextResponse.json({ error: 'Email and password required' }, { status: 400 }))
        }

        const member = await database.collection('team_members').findOne({ email, is_active: true })
        if (!member) {
            return handleCORS(NextResponse.json({ error: 'Invalid credentials' }, { status: 401 }))
        }

        const valid = await bcrypt.compare(password, member.password_hash)
        if (!valid) {
            return handleCORS(NextResponse.json({ error: 'Invalid credentials' }, { status: 401 }))
        }

        const token = jwt.sign(
            { id: member.id, email: member.email, role: member.role, name: member.name },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        // Set httpOnly cookie
        const cookieStore = cookies()
        cookieStore.set('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        })

        return handleCORS(NextResponse.json({
            token, // Keep sending token for scripts
            user: { id: member.id, email: member.email, role: member.role, name: member.name }
        }))
    })
}

export async function GET(request) {
    return withErrorLogging(request, async () => {
        const user = verifyToken(request)
        if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
        return handleCORS(NextResponse.json({ user }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
