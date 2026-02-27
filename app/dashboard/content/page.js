'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { apiFetch, swrFetcher } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EditableCell } from '@/components/EditableCell'
import { LinkCell } from '@/components/LinkCell'
import { FileText, Plus, ExternalLink, Trash2, Link2, Filter, Search, GripVertical, GripHorizontal } from 'lucide-react'
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
  OUTLINE_STATUSES, TOPIC_APPROVALS, BLOG_APPROVALS, BLOG_STATUSES,
  topicApprovalColors, blogStatusColors, approvalColors
} from '@/lib/constants'

// Shared components imported from @/components/

export default function ContentCalendarPage() {
  const { data: contentData, mutate: mutateContent, error: contentErr } = useSWR('/api/content', swrFetcher)
  const { data: clientsData } = useSWR('/api/clients', swrFetcher)

  const content = Array.isArray(contentData) ? contentData : []
  const clients = Array.isArray(clientsData) ? clientsData : []
  const loading = !contentData && !contentErr
  const [saving, setSaving] = useState({})
  const [filters, setFilters] = useState({ client_id: '', blog_status: '', search: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [columnOrder, setColumnOrder] = useState([])

  useEffect(() => {
    const saved = localStorage.getItem('content_column_order')
    if (saved) setColumnOrder(JSON.parse(saved))
    else setColumnOrder(['client', 'week', 'title', 'keyword', 'writer', 'topic_approval', 'blog_status', 'blog_approval', 'link', 'published', 'actions'])
  }, [])

  const updateContent = async (contentId, field, value) => {
    setSaving(s => ({ ...s, [contentId]: true }))
    const updatedContent = content.map(c => c.id === contentId ? { ...c, [field]: value } : c)
    mutateContent(updatedContent, false)
    await apiFetch(`/api/content/${contentId}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) })
    mutateContent()
    setSaving(s => ({ ...s, [contentId]: false }))
  }

  const deleteContent = async (contentId) => {
    if (!confirm('Delete this content item?')) return
    await apiFetch(`/api/content/${contentId}`, { method: 'DELETE' })
    mutateContent()
  }

  // Filter content
  const filtered = content.filter(item => {
    if (filters.client_id && item.client_id !== filters.client_id) return false
    if (filters.blog_status && item.blog_status !== filters.blog_status) return false
    if (filters.search) {
      const search = filters.search.toLowerCase()
      const matchTitle = item.blog_title?.toLowerCase().includes(search)
      const matchKeyword = item.primary_keyword?.toLowerCase().includes(search)
      const matchWriter = item.writer?.toLowerCase().includes(search)
      if (!matchTitle && !matchKeyword && !matchWriter) return false
    }
    return true
  })

  // Stats
  const published = content.filter(c => c.blog_status === 'Published').length
  const drafts = content.filter(c => c.blog_status === 'Draft').length
  const inProgress = content.filter(c => c.blog_status === 'In Progress' || c.blog_status === 'Sent for Approval').length

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))

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
      // Persistence: In a real app, you'd send a PUT to update 'sort_order'
    }
  }

  const handleColDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const updated = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem('content_column_order', JSON.stringify(updated))
        return updated
      })
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  // --- Column and Row Components ---
  const SortableHeader = ({ id, label }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 0 }
    return (
      <th ref={setNodeRef} style={style} className={`text-left px-3 py-2.5 font-semibold text-gray-600 bg-gray-50 border-r border-gray-100 last:border-0 ${isDragging ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2">
          <div {...attributes} {...listeners} className="cursor-grab hover:text-blue-500">
            <GripHorizontal className="w-3 h-3" />
          </div>
          <span>{label}</span>
        </div>
      </th>
    )
  }

  const SortableRow = ({ item }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 0 }
    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        {columnOrder.map(colId => (
          <td key={colId} className="px-3 py-1.5">
            {colId === 'client' && (
              <div className="flex items-center gap-2">
                <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3 h-3" />
                </div>
                <Link href={`/dashboard/clients/${item.client_id}`} className="text-xs text-blue-600 hover:underline font-medium">
                  {clientMap[item.client_id] || 'Unknown'}
                </Link>
              </div>
            )}
            {colId === 'week' && <EditableCell value={item.week} onSave={v => updateContent(item.id, 'week', v)} placeholder="Week" />}
            {colId === 'title' && <EditableCell value={item.blog_title} onSave={v => updateContent(item.id, 'blog_title', v)} />}
            {colId === 'keyword' && <EditableCell value={item.primary_keyword} onSave={v => updateContent(item.id, 'primary_keyword', v)} placeholder="keyword" />}
            {colId === 'writer' && <EditableCell value={item.writer} onSave={v => updateContent(item.id, 'writer', v)} placeholder="Writer" />}
            {colId === 'topic_approval' && <EditableCell value={item.topic_approval_status || 'Pending'} type="topic_approval" options={TOPIC_APPROVALS} onSave={v => updateContent(item.id, 'topic_approval_status', v)} />}
            {colId === 'blog_status' && <EditableCell value={item.blog_status || 'Draft'} type="blog_status" options={BLOG_STATUSES} onSave={v => updateContent(item.id, 'blog_status', v)} />}
            {colId === 'blog_approval' && <EditableCell value={item.blog_approval_status || 'Pending Review'} type="blog_approval" options={BLOG_APPROVALS} onSave={v => updateContent(item.id, 'blog_approval_status', v)} />}
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
    topic_approval: 'Topic Approval', blog_status: 'Blog Status', blog_approval: 'Blog Approval',
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

      {/* Filters omitted for brevity, same as before */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-400" />
            <Input
              type="text" placeholder="Search title, keyword, writer..."
              value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="w-64 h-8 text-sm"
            />
          </div>
          <Select value={filters.client_id || '__all__'} onValueChange={v => setFilters(f => ({ ...f, client_id: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="All Clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Clients</SelectItem>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.blog_status || '__all__'} onValueChange={v => setFilters(f => ({ ...f, blog_status: v === '__all__' ? '' : v }))}>
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              {BLOG_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => setFilters({ client_id: '', blog_status: '', search: '' })}>Clear</Button>
        </div>
      )}

      {/* Main Table with DnD */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd} modifiers={[restrictToHorizontalAxis]}>
          <table className="w-full text-sm" style={{ minWidth: '1300px', tableLayout: 'fixed' }}>
            <thead>
              <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                <tr className="border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10 text-xs">
                  {columnOrder.map(colId => (
                    <SortableHeader key={colId} id={colId} label={columnLabels[colId]} />
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
                  <SortableContext items={filtered.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {filtered.map(item => <SortableRow key={item.id} item={item} />)}
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
    </div>
  )
}
