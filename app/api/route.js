import { NextResponse } from 'next/server'
import { handleCORS } from '@/lib/api-utils'

export async function GET() {
    return handleCORS(NextResponse.json({ message: 'CubeHQ Dashboard API v1.0' }))
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
