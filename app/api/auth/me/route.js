import { NextResponse } from 'next/server'
import { handleCORS, withErrorLogging, verifyToken } from '@/lib/api-utils'

export const runtime = 'nodejs';

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
