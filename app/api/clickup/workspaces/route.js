import { NextResponse } from 'next/server'
import { handleCORS, withAuth } from '@/lib/api-utils'

export async function POST(request) {
    return withAuth(request, async () => {
        try {
            const body = await request.json()
            const { token } = body
            if (!token) return handleCORS(NextResponse.json({ error: 'ClickUp token required' }, { status: 400 }))

            const resp = await fetch('https://api.clickup.com/api/v2/team', {
                headers: { 'Authorization': token, 'Content-Type': 'application/json' }
            })

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}))
                return handleCORS(NextResponse.json({ error: err.err || 'Invalid ClickUp token or no access' }, { status: 400 }))
            }

            const data = await resp.json()
            const workspaces = (data.teams || []).map(t => ({ id: t.id, name: t.name }))
            return handleCORS(NextResponse.json({ workspaces }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
