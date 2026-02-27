'use client'

import { useEffect, useState, useRef } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { statusColors, priorityColors, approvalColors, topicApprovalColors, blogStatusColors } from '@/lib/constants'

export function EditableCell({ value, type = 'text', options = [], onSave, placeholder = '—', disabled = false }) {
    const [editing, setEditing] = useState(false)
    const [val, setVal] = useState(value || '')
    const inputRef = useRef(null)

    useEffect(() => setVal(value || ''), [value])
    useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

    const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }

    if (editing && !disabled) {
        if (type === 'select' || type === 'status' || type === 'priority' || type === 'approval' || type === 'internal_approval' || type === 'topic_approval' || type === 'blog_status' || type === 'blog_approval') {
            return (
                <Select
                    value={val || '__none__'}
                    onValueChange={v => {
                        const real = v === '__none__' ? '' : v
                        setVal(real); setEditing(false)
                        if (real !== (value || '')) onSave(real)
                    }}
                >
                    <SelectTrigger className="h-7 text-xs border-blue-400 min-w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="__none__" className="text-xs text-gray-400">(none)</SelectItem>
                        {options.filter(o => o !== '').map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
                    </SelectContent>
                </Select>
            )
        }
        return (
            <input
                ref={inputRef}
                type={type === 'date' ? 'date' : 'text'}
                value={val}
                onChange={e => setVal(e.target.value)}
                onBlur={save}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false) } }}
                className="w-full px-2 py-1 text-xs border border-blue-400 rounded shadow-sm bg-white focus:outline-none min-w-[80px]"
                placeholder={placeholder}
            />
        )
    }

    const display = () => {
        if (type === 'status') return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${statusColors[val] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {val || <span className="text-gray-300">—</span>}
            </span>
        )
        if (type === 'priority') return (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityColors[val] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {val || <span className="text-gray-300">—</span>}
            </span>
        )
        if (type === 'approval' || type === 'blog_approval') return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${approvalColors[val] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                {val === null ? 'Pending Review' : (val || 'Pending Review')}
            </span>
        )
        if (type === 'internal_approval') return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${val === 'Approved' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                {val || 'Pending'}
            </span>
        )
        if (type === 'topic_approval') return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${topicApprovalColors[val] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                {val || 'Pending'}
            </span>
        )
        if (type === 'blog_status') return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${blogStatusColors[val] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {val || 'Draft'}
            </span>
        )
        return <span className={`text-xs truncate block ${disabled ? 'text-gray-400' : 'text-gray-700'}`} title={val}>{val || <span className="text-gray-300">—</span>}</span>
    }

    return (
        <div onClick={() => !disabled && setEditing(true)}
            className={`rounded px-1 py-0.5 min-h-[24px] w-full transition-all overflow-hidden ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200'}`}
            title={disabled ? 'Disabled' : 'Click to edit'}>
            {display()}
        </div>
    )
}
