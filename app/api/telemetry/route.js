import { NextResponse } from 'next/server'
import { handleCORS, withErrorLogging, rateLimit } from '@/lib/api-utils'

export const runtime = 'nodejs';

/**
 * Telemetry endpoint for Dashboard Resilience.
 */
export async function POST(request) {
    const limiter = rateLimit(request, { limit: 20, windowMs: 60000 })
    if (limiter.blocked) return limiter.response

    return withErrorLogging(request, async () => {
        const body = await request.json()
        const { type, message, stack, url, ...context } = body

        const severity = type === 'critical_violation' ? 'CRITICAL' : 'ERROR'
        console.log(`[TELEMETRY] [${severity}] [${new Date().toISOString()}]`, JSON.stringify({
            type,
            message,
            url,
            stack: stack?.split('\n').slice(0, 3).join(' | '),
            ...context
        }))

        return handleCORS(NextResponse.json({ status: 'ok' }))
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
