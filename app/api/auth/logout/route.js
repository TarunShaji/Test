import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { handleCORS, withErrorLogging } from '@/lib/api-utils'

export const runtime = 'nodejs';

export async function POST(request) {
    return withErrorLogging(request, async () => {
        const cookieStore = cookies()
        cookieStore.delete('token')

        return handleCORS(NextResponse.json({ message: 'Logged out successfully' }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
