import { NextResponse } from 'next/server'
import { handleCORS, withAuth } from '@/lib/api-utils'

export async function POST(request) {
    return withAuth(request, async () => {
        try {
            const body = await request.json()
            const { token, workspace_id } = body
            if (!token || !workspace_id) {
                return handleCORS(NextResponse.json({ error: 'token and workspace_id required' }, { status: 400 }))
            }

            const headers = { 'Authorization': token, 'Content-Type': 'application/json' }
            const spacesResp = await fetch(`https://api.clickup.com/api/v2/team/${workspace_id}/space?archived=false`, { headers })
            if (!spacesResp.ok) return handleCORS(NextResponse.json({ error: 'Failed to fetch spaces' }, { status: 400 }))

            const spacesData = await spacesResp.json()
            const spaces = spacesData.spaces || []

            const allLists = []
            for (const space of spaces) {
                const foldersResp = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder?archived=false`, { headers })
                if (foldersResp.ok) {
                    const foldersData = await foldersResp.json()
                    for (const folder of (foldersData.folders || [])) {
                        for (const list of (folder.lists || [])) {
                            allLists.push({ id: list.id, name: list.name, space_name: space.name, folder_name: folder.name })
                        }
                    }
                }

                const listsResp = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`, { headers })
                if (listsResp.ok) {
                    const listsData = await listsResp.json()
                    for (const list of (listsData.lists || [])) {
                        allLists.push({ id: list.id, name: list.name, space_name: space.name, folder_name: null })
                    }
                }
            }
            return handleCORS(NextResponse.json({ lists: allLists }))
        } catch (error) {
            return handleCORS(NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 }))
        }
    })
}

export async function OPTIONS() {
    return handleCORS(new NextResponse(null, { status: 200 }))
}
