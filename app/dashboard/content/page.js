'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { apiFetch, swrFetcher } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EditableCell } from '@/components/EditableCell'
import { LinkCell } from '@/components/LinkCell'
import { FileText, Plus, Trash2, Filter, Search, GripVertical, GripHorizontal } from 'lucide-react'
import { safeJSON, safeArray } from '@/lib/safe'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers'

import {
  OUTLINE_STATUSES, TOPIC_APPROVALS, BLOG_APPROVALS, BLOG_STATUSES, CONTENT_INTERNAL_APPROVALS,
  topicApprovalColors, blogStatusColors, approvalColors, CONTENT_COLUMN_WIDTHS
} from '@/lib/constants'

const COL_ORDER_KEY = 'content_column_order_v2'
const DEFAULT_COL_ORDER = [
  'client', 'week', 'title', 'keyword', 'writer',
  'topic_approval', 'blog_status',
  'blog_internal_approval', 'send_link', 'blog_approval', 'blog_feedback',
  'link', 'published', 'actions'
]

export default function ContentCalendarPage() {
  const { data: contentData, mutate: mutateContent, error: contentErr } = useSWR('/api/content', swrFetcher)
  const { data: clientsData } = useSWR('/api/clients', swrFetcher)

  const content = useMemo(() => safeArray(contentData), [contentData])
  const clients = useMemo(() => safeArray(clientsData), [clientsData])
  const loading = !contentData && !contentErr
  const [saving, setSaving] = useState({})
  const [filters, setFilters] = useState({ client_id: '', blog_status: '', search: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [columnOrder, setColumnOrder] = useState([])
  const [confirmConfig, setConfirmConfig] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem(COL_ORDER_KEY)
    const parsed = safeJSON(saved)
    if (parsed) setColumnOrder(parsed)
    else setColumnOrder(DEFAULT_COL_ORDER)
  }, [])

  const updateContent = async (contentId, field, value) => {
    setSaving(s => ({ ...s, [contentId]: true }))
    const updatedContent = content.map(c => c?.id === contentId ? { ...c, [field]: value } : c)
    mutateContent(updatedContent, false)
    const res = await apiFetch(`/api/content/${contentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        [field]: value,
        updated_at: (content.find(c => c?.id === contentId))?.updated_at
      })
    })

    if (res.status === 409) {
      alert('Concurrency error: Content was modified by another user.')
      mutateContent()
    } else if (res.ok) {
      const updated = await res.json()
      mutateContent(content.map(c => c.id === contentId ? updated : c), false)
    } else {
      mutateContent()
    }
    setSaving(s => ({ ...s, [contentId]: false }))
  }

  const publishContent = async (contentId) => {
    const item = content.find(c => c?.id === contentId)
    setSaving(s => ({ ...s, [contentId]: true }))
    try {
      const res = await apiFetch(`/api/content/${contentId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ updated_at: item?.updated_at })
      })
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Publish failed')
        mutateContent()
      } else {
        const data = await res.json()
        if (data.content) {
          mutateContent(content.map(c => c.id === contentId ? data.content : c), false)
        }
      }
    } catch (e) {
      console.error('Publish failed', e)
    }
    setSaving(s => ({ ...s, [contentId]: false }))
  }

  const deleteContent = (contentId) => {
    setConfirmConfig({
      title: 'Delete Content Item',
      description: 'This will permanently delete this blog content item. This cannot be undone.',
      onConfirm: async () => {
        await apiFetch(`/api/content/${contentId}`, { method: 'DELETE' })
        mutateContent()
      }
    })
  }

  // Filter content
  const filtered = useMemo(() => content.filter(item => {
    if (filters.client_id && item?.client_id !== filters.client_id) return false
    if (filters.blog_status && item?.blog_status !== filters.blog_status) return false
    if (filters.search) {
      const search = filters.search.toLowerCase()
      const matchTitle = item?.blog_title?.toLowerCase().includes(search)
      const matchKeyword = item?.primary_keyword?.toLowerCase().includes(search)
      const matchWriter = item?.writer?.toLowerCase().includes(search)
      if (!matchTitle && !matchKeyword && !matchWriter) return false
    }
    return true
  }), [content, filters])

  // Stats
  const published = useMemo(() => content.filter(c => c?.blog_status === 'Published').length, [content])
  const drafts = useMemo(() => content.filter(c => c?.blog_status === 'Draft').length, [content])
  const inProgress = useMemo(() => content.filter(c => c?.blog_status === 'In Progress' || c?.blog_status === 'Sent for Approval').length, [content])

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c?.id, c?.name])), [clients])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleRowDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      const oldIndex = content.findIndex((c) => c.id === active.id)
      const newIndex = content.findIndex((c) => c.id === over.id)
      const reordered = arrayMove(content, oldIndex, newIndex)
      mutateContent(reordered, false)
    }
  }

  const handleColDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const updated = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem(COL_ORDER_KEY, JSON.stringify(updated))
        return updated
      })
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  // --- Column and Row Components ---
  const SortableHeader = ({ id, label }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'header' })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 20 : 0,
      width: CONTENT_COLUMN_WIDTHS[id] || 'auto',
      minWidth: CONTENT_COLUMN_WIDTHS[id] || 'auto'
    }
    return (
      <th ref={setNodeRef} style={style} className={`text-left px-3 py-2.5 font-semibold text-gray-600 bg-gray-50 border-r border-gray-100 last:border-0 ${isDragging ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div {...attributes} {...listeners} className="cursor-grab hover:text-blue-500 flex-shrink-0">
            <GripHorizontal className="w-3 h-3" />
          </div>
          <span className="truncate" title={label}>{label}</span>
        </div>
      </th>
    )
  }

  const SortableRow = ({ item }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item?.id || 'unknown' })
    if (!item?.id) return null
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 0 }
    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        {safeArray(columnOrder).map(colId => (
          <td key={colId} className={`px-3 py-1.5 overflow-hidden ${colId === 'blog_internal_approval' || colId === 'send_link' ? 'bg-gray-50/50' : ''}`} style={{ width: CONTENT_COLUMN_WIDTHS[colId], minWidth: CONTENT_COLUMN_WIDTHS[colId] }}>
            {colId === 'client' && (
              <div className="flex items-center gap-2">
                <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3 h-3" />
                </div>
                <Link href={`/dashboard/clients/${item?.client_id}`} className="text-xs text-blue-600 hover:underline font-medium">
                  {clientMap[item?.client_id] || 'Unknown'}
                </Link>
              </div>
            )}
            {colId === 'week' && <EditableCell value={item.week} onSave={v => updateContent(item.id, 'week', v)} placeholder="Week" />}
            {colId === 'title' && <EditableCell value={item.blog_title} onSave={v => updateContent(item.id, 'blog_title', v)} />}
            {colId === 'keyword' && <EditableCell value={item.primary_keyword} onSave={v => updateContent(item.id, 'primary_keyword', v)} placeholder="keyword" />}
            {colId === 'writer' && <EditableCell value={item.writer} onSave={v => updateContent(item.id, 'writer', v)} placeholder="Writer" />}
            {colId === 'topic_approval' && <EditableCell value={item.topic_approval_status || 'Pending'} type="topic_approval" options={TOPIC_APPROVALS} onSave={v => updateContent(item.id, 'topic_approval_status', v)} />}
            {colId === 'blog_status' && <EditableCell value={item.blog_status || 'Draft'} type="blog_status" options={BLOG_STATUSES} onSave={v => updateContent(item.id, 'blog_status', v)} />}
            {colId === 'blog_internal_approval' && (
              <EditableCell
                value={item.blog_internal_approval || 'Pending'}
                type="internal_approval"
                options={CONTENT_INTERNAL_APPROVALS}
                disabled={item.blog_status !== 'Sent for Approval' && item.blog_status !== 'Published' && item.blog_status !== 'In Progress'}
                onSave={v => updateContent(item.id, 'blog_internal_approval', v)}
              />
            )}
            {colId === 'send_link' && (
              <Button
                size="sm"
                variant={item.client_link_visible_blog ? 'ghost' : 'default'}
                className={`h-7 px-2 text-[10px] uppercase tracking-wider font-bold ${item.client_link_visible_blog ? 'text-green-600' : ''}`}
                disabled={
                  item.blog_internal_approval !== 'Approved' ||
                  !item.blog_link ||
                  item.client_link_visible_blog === true
                }
                onClick={() => publishContent(item.id)}
              >
                {item.client_link_visible_blog ? 'Sent' : 'Send Link'}
              </Button>
            )}
            {colId === 'blog_approval' && (
              <EditableCell value={item.blog_approval_status || 'Pending Review'} type="blog_approval" options={BLOG_APPROVALS} disabled={true} />
            )}
            {colId === 'blog_feedback' && (
              <div className="max-w-[160px]">
                {item.blog_approval_status === 'Changes Required' ? (
                  <div className="text-[10px] text-red-600 bg-red-50 p-1 rounded border border-red-100 line-clamp-2" title={item.blog_client_feedback_note}>
                    {item.blog_client_feedback_note || 'Changes requested'}
                  </div>
                ) : <span className="text-gray-300 text-xs">—</span>}
              </div>
            )}
            {colId === 'link' && <LinkCell value={item.blog_link} onSave={v => updateContent(item.id, 'blog_link', v)} />}
            {colId === 'published' && <EditableCell value={item.published_date} type="date" onSave={v => updateContent(item.id, 'published_date', v)} />}
            {colId === 'actions' && (
              <button onClick={() => deleteContent(item.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </td>
        ))}
      </tr>
    )
  }

  const columnLabels = {
    client: 'Client', week: 'Week', title: 'Blog Title', keyword: 'Keyword', writer: 'Writer',
    topic_approval: 'Topic Approval', blog_status: 'Blog Status',
    blog_internal_approval: 'Internal Approval', send_link: 'Send Link',
    blog_approval: 'Client Approval', blog_feedback: 'Feedback',
    link: 'Blog Link', published: 'Published', actions: ''
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Manage blog content across all clients</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1">
          <Filter className="w-4 h-4" /> Filters
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{content.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total Posts</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{published}</div>
          <div className="text-xs text-gray-500 mt-1">Published</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{inProgress}</div>
          <div className="text-xs text-gray-500 mt-1">In Progress</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-400">{drafts}</div>
          <div className="text-xs text-gray-500 mt-1">Drafts</div>
        </div>
      </div>

      {/* Always-visible search + collapsible filter bar */}
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-white border border-gray-200 rounded-lg items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            type="text" placeholder="Search blog title, keyword, writer…"
            value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            className="h-8 text-xs pl-8 w-60 border-gray-200"
          />
        </div>
        {showFilters && (
          <>
            <Select value={filters.client_id || '__all__'} onValueChange={v => setFilters(f => ({ ...f, client_id: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All Clients" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Clients</SelectItem>
                {safeArray(clients).map(c => <SelectItem key={c?.id} value={c?.id}>{c?.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.blog_status || '__all__'} onValueChange={v => setFilters(f => ({ ...f, blog_status: v === '__all__' ? '' : v }))}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Statuses</SelectItem>
                {BLOG_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        {(filters.search || filters.client_id || filters.blog_status) && (
          <button onClick={() => setFilters({ client_id: '', blog_status: '', search: '' })} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">Clear</button>
        )}
      </div>

      {/* Main Table with DnD */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd} modifiers={[restrictToHorizontalAxis]}>
          <table className="w-full text-sm" style={{ minWidth: '1700px', tableLayout: 'fixed' }}>
            <thead>
              <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                <tr className="border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10 text-xs">
                  {columnOrder.map(colId => (
                    <SortableHeader key={colId} id={colId} label={columnLabels[colId] || colId} />
                  ))}
                </tr>
              </SortableContext>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columnOrder.length} className="py-16 text-center text-gray-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    {content.length === 0 ? 'No content calendar items yet.' : 'No items match your filters.'}
                  </td>
                </tr>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd} modifiers={[restrictToVerticalAxis]}>
                  <SortableContext items={filtered.map(i => i?.id)} strategy={verticalListSortingStrategy}>
                    {filtered.map(item => <SortableRow key={item?.id} item={item} />)}
                  </SortableContext>
                </DndContext>
              )}
            </tbody>
          </table>
        </DndContext>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        Showing {filtered.length} of {content.length} items • Drag headers to reorder columns
      </div>
      <ConfirmDialog config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  )
}
