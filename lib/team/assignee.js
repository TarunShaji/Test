export async function getActiveTeamMemberIdSet(database) {
    const members = await database
        .collection('team_members')
        .find({ is_active: { $ne: false } }, { projection: { id: 1 } })
        .toArray()

    return new Set(members.map((m) => m.id))
}

export function normalizeAssignedTo(rawValue, validMemberIds) {
    if (rawValue === undefined) return undefined
    if (rawValue === null) return null
    if (Array.isArray(rawValue)) {
        const valid = [...new Set(rawValue
            .map((v) => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean)
            .filter((id) => validMemberIds.has(id)))]
        if (valid.length === 0) return null
        return valid.length === 1 ? valid[0] : valid
    }
    if (typeof rawValue !== 'string' || rawValue.trim() === '') return null
    return validMemberIds.has(rawValue) ? rawValue.trim() : null
}

export function extractAssignedIds(value) {
    if (!value) return []
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string' && v.trim() !== '')
    if (typeof value === 'string' && value.trim() !== '') return [value.trim()]
    return []
}

export function buildAssignedToFilter(memberId) {
    return {
        $or: [
            { assigned_to: memberId },
            { assigned_to: { $elemMatch: { $eq: memberId } } }
        ]
    }
}
