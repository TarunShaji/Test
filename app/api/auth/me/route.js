import { NextResponse } from 'next/server'
import { handleCORS, verifyToken } from '@/lib/api-utils'

export async function GET(request) {
    try {
        const user = verifyToken(request)
        if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
        return handleCORS(NextResponse.json({ user }))
    } catch (error) {
        return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
    }
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
