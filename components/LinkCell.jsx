'use client'

import { useEffect, useState, useRef } from 'react'
import { Link2 } from 'lucide-react'

export function LinkCell({ value, onSave }) {
    const [editing, setEditing] = useState(false)
    const [val, setVal] = useState(value || '')
    const inputRef = useRef(null)

    useEffect(() => setVal(value || ''), [value])
    useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

    const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }

    if (editing) {
        return (
            <input
                ref={inputRef}
                type="url"
                value={val}
                onChange={e => setVal(e.target.value)}
                onBlur={save}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false) } }}
                className="w-full px-2 py-1 text-xs border border-blue-400 rounded bg-white focus:outline-none min-w-[140px]"
                placeholder="https://..."
            />
        )
    }

    if (val) {
        return (
            <div className="flex items-center gap-1">
                <a href={val} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-medium transition-colors"
                    title={val}
                >
                    <Link2 className="w-3 h-3" /> Open
                </a>
                <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-gray-500 p-0.5 rounded">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
            </div>
        )
    }

    return (
        <button onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs text-gray-300 hover:text-blue-500 transition-colors px-1 py-0.5 rounded hover:bg-blue-50"
            title="Add link">
            <Link2 className="w-3 h-3" /> Add link
        </button>
    )
}
