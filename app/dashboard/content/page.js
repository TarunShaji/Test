'use client'

import { useEffect, useState, useRef, useMemo, Suspense } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch, swrFetcher } from '@/lib/middleware/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EditableCell } from '@/components/table/EditableCell'
import { LinkCell } from '@/components/table/LinkCell'
import { FileText, Plus, Trash2, Filter, Search, GripVertical, GripHorizontal } from 'lucide-react'
import { safeJSON, safeArray } from '@/lib/safe'
import { Pagination } from '@/components/shared/Pagination'
import { ClientSwitcher } from '@/components/shared/ClientSwitcher'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
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
  INTERN_STATUSES, topicApprovalColors, blogStatusColors, approvalColors, internStatusColors, CONTENT_COLUMN_WIDTHS
} from '@/lib/constants'

const COL_ORDER_KEY = 'content_column_order_v4'
const DEFAULT_COL_ORDER = [
  'client', 'week', 'title', 'primary_keyword', 'secondary_keyword', 'writer',
  'outline', 'intern_status', 'search_volume',
  'topic_approval', 'blog_status', 'blog_doc',
  'blog_internal_approval', 'send_link', 'date_sent', 'blog_approval', 'approved_on', 'blog_feedback',
  'link', 'required_by', 'published', 'actions'
]

function ContentCalendarContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Sync state with URL
  const filterClient = searchParams.get('client_id') || 'all'
  const filterStatus = searchParams.get('blog_status') || 'all'
  const filterWeek = searchParams.get('week') || ''
  const filterWriter = searchParams.get('writer') || ''
  const filterTopicApproval = searchParams.get('topic_approval') || 'all'
  const filterInternalApproval = searchParams.get('internal_approval') || 'all'
  const filterClientApproval = searchParams.get('client_approval') || 'all'
  const filterPublished = searchParams.get('published') || 'all'
  const filterSearch = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page')) || 1

  const queryParams = new URLSearchParams(searchParams.toString())
  if (!queryParams.get('limit')) queryParams.set('limit', '50')

  const { data: contentResponse, mutate: mutateContent, error: contentErr } = useSWR(`/api/content?${queryParams.toString()}`, swrFetcher)
  const { data: clientsData } = useSWR('/api/clients?lite=1', swrFetcher)

  const content = useMemo(() => safeArray(contentResponse?.data), [contentResponse])
  const pagination = useMemo(() => ({
    total: contentResponse?.total || 0,
    page: contentResponse?.page || 1,
    totalPages: contentResponse?.totalPages || 1
  }), [contentResponse])

  const clients = useMemo(() => safeArray(clientsData), [clientsData])
  const loading = !contentResponse && !contentErr
  const [saving, setSaving] = useState({})

  const [localSearch, setLocalSearch] = useState(filterSearch)
  const [showFilters, setShowFilters] = useState(true)
  const [columnOrder, setColumnOrder] = useState([])
  const [newContent, setNewContent] = useState({ blog_title: '', client_id: '' })
  const [addingContent, setAddingContent] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState(null)

  const updateQueryParams = (updates) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    })
    if (!updates.page) params.delete('page')
    router.push(`/dashboard/content?${params.toString()}`)
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filterSearch) {
        updateQueryParams({ search: localSearch })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch])

  useEffect(() => {
    // Bump to v4 to clear stale column orders
    localStorage.removeItem('content_column_order_v2')
    localStorage.removeItem('content_column_order_v3')

    const saved = localStorage.getItem(COL_ORDER_KEY)
    const parsed = safeJSON(saved)
    if (parsed && Array.isArray(parsed)) {
      setColumnOrder(parsed)
    } else {
      setColumnOrder(DEFAULT_COL_ORDER)
    }
  }, [])

  const updateContent = async (contentId, field, value) => {
    setSaving(s => ({ ...s, [contentId]: true }))
    const optimistic = content.map(c => c?.id === contentId ? { ...c, [field]: value } : c)
    // Preserve the paginated envelope — only replace the data array
    mutateContent({ ...contentResponse, data: optimistic }, false)
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
      mutateContent({ ...contentResponse, data: optimistic.map(c => c.id === contentId ? updated : c) }, false)
    } else {
      mutateContent()
    }
    setSaving(s => ({ ...s, [contentId]: false }))
  }

  const addContent = async () => {
    if (!newContent.blog_title.trim() || !newContent.client_id) return
    setAddingContent(true)
    try {
      const res = await apiFetch('/api/content', {
        method: 'POST',
        body: JSON.stringify(newContent)
      })
      if (res.ok) {
        setNewContent({ blog_title: '', client_id: '' })
        mutateContent()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to add content')
      }
    } catch (e) {
      console.error('Add content failed', e)
    }
    setAddingContent(false)
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
          // Preserve envelope so the page does not go blank
          mutateContent({ ...contentResponse, data: content.map(c => c.id === contentId ? data.content : c) }, false)
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

  const filtered = content

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c?.id, c?.name])), [clients])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleRowDragEnd = async (event) => {
    const { active, over } = event
    if (!over) return
    if (active.id !== over.id) {
      const oldIndex = content.findIndex((c) => c.id === active.id)
      const newIndex = content.findIndex((c) => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(content, oldIndex, newIndex)
      mutateContent({ ...contentResponse, data: reordered }, false)

      try {
        await apiFetch('/api/content/reorder', {
          method: 'PUT',
          body: JSON.stringify({ ids: reordered.map(c => c.id) })
        })
      } catch (e) {
        console.error('Failed to persist content order', e)
        mutateContent()
      }
    }
  }

  const handleColDragEnd = (event) => {
    const { active, over } = event
    if (!over) return
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

  const SortableHeader = ({ id, label }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'header' })
    const isSticky = id === 'title'
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 30 : (isSticky ? 20 : 0),
      width: CONTENT_COLUMN_WIDTHS[id] || 'auto',
      minWidth: CONTENT_COLUMN_WIDTHS[id] || 'auto',
      ...(isSticky ? { position: 'sticky', left: '55px', background: '#fff', borderRight: '1px solid #f3f4f6' } : {})
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

  const SortableRow = ({ item, rowIndex }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item?.id || 'unknown' })
    if (!item?.id) return null
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 0 }
    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        {/* Serial number — always leftmost, not draggable */}
        <td className="px-2 py-1.5 text-center text-gray-400 font-mono text-[11px] bg-white border-r border-gray-100 select-none"
          style={{ width: CONTENT_COLUMN_WIDTHS.serial, minWidth: CONTENT_COLUMN_WIDTHS.serial, position: 'sticky', left: 0, background: '#fff', zIndex: 20 }}>
          {rowIndex + 1}
        </td>
        {safeArray(columnOrder).map(colId => {
          const isSticky = colId === 'title'
          const stickyStyle = isSticky ? { position: 'sticky', left: '55px', background: '#fff', zIndex: 20, borderRight: '1px solid #f3f4f6', boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)' } : {}
          return (
            <td key={colId} className={`px-3 py-1.5 overflow-hidden ${colId === 'blog_internal_approval' || colId === 'send_link' ? 'bg-gray-50/50' : ''}`}
              style={{ width: CONTENT_COLUMN_WIDTHS[colId], minWidth: CONTENT_COLUMN_WIDTHS[colId], ...stickyStyle }}>
              {colId === 'client' && (
                <div className="flex items-center gap-2">
                  <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="w-3 h-3" />
                  </div>
                  <Link href={`/dashboard/clients/${item?.client_id}`} className="text-xs text-blue-600 hover:underline font-medium">
                    {clients.find(c => c.id === item?.client_id)?.name || clientMap[item?.client_id] || 'Unknown'}
                  </Link>
                </div>
              )}
              {colId === 'week' && <EditableCell value={item.week} onSave={v => updateContent(item.id, 'week', v)} placeholder="Week" />}
              {colId === 'title' && <EditableCell value={item.blog_title} onSave={v => updateContent(item.id, 'blog_title', v)} />}
              {colId === 'primary_keyword' && <EditableCell value={item.primary_keyword} onSave={v => updateContent(item.id, 'primary_keyword', v)} placeholder="Primary Keyword" />}
              {colId === 'secondary_keyword' && <EditableCell value={item.secondary_keywords} onSave={v => updateContent(item.id, 'secondary_keywords', v)} placeholder="Secondary Keyword" />}
              {colId === 'writer' && <EditableCell value={item.writer} onSave={v => updateContent(item.id, 'writer', v)} placeholder="Writer" />}
              {colId === 'search_volume' && <EditableCell value={item.search_volume != null ? String(item.search_volume) : ''} onSave={v => updateContent(item.id, 'search_volume', v ? parseInt(v.replace(/,/g, ''), 10) : null)} placeholder="Vol" />}
              {colId === 'outline' && <LinkCell value={item.outline_link} onSave={v => updateContent(item.id, 'outline_link', v)} />}
              {colId === 'intern_status' && (
                <select
                  value={item.intern_status || ''}
                  onChange={e => updateContent(item.id, 'intern_status', e.target.value || null)}
                  className={`text-[10px] px-2 py-1 rounded-full border font-medium appearance-none cursor-pointer ${internStatusColors[item.intern_status] || 'bg-gray-50 text-gray-400 border-gray-200'}`}
                >
                  <option value="">— None —</option>
                  {INTERN_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              {colId === 'required_by' && <EditableCell value={item.required_by} type="date" onSave={v => updateContent(item.id, 'required_by', v)} />}
              {colId === 'topic_approval' && <EditableCell value={item.topic_approval_status || 'Pending'} type="topic_approval" options={TOPIC_APPROVALS} onSave={v => updateContent(item.id, 'topic_approval_status', v)} />}
              {colId === 'blog_status' && <EditableCell value={item.blog_status || 'Draft'} type="blog_status" options={BLOG_STATUSES} onSave={v => updateContent(item.id, 'blog_status', v)} />}
              {colId === 'blog_internal_approval' && (
                <EditableCell
                  value={item.blog_internal_approval || 'Pending'}
                  type="internal_approval"
                  options={CONTENT_INTERNAL_APPROVALS}
                  disabled={!item.blog_doc_link}
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
                    !item.blog_doc_link ||
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
              {colId === 'approved_on' && (
                <span className="text-xs text-gray-500">{item.blog_approval_date || '—'}</span>
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
              {colId === 'blog_doc' && <LinkCell value={item.blog_doc_link} onSave={v => updateContent(item.id, 'blog_doc_link', v)} />}
              {colId === 'link' && <LinkCell value={item.blog_link} onSave={v => updateContent(item.id, 'blog_link', v)} />}
              {colId === 'published' && <EditableCell value={item.published_date} type="date" onSave={v => updateContent(item.id, 'published_date', v)} />}
              {colId === 'date_sent' && (
                <span className="text-xs text-gray-500">{item.date_sent_for_approval || '—'}</span>
              )}
              {colId === 'actions' && (
                <button onClick={() => deleteContent(item.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </td>
          )
        })}
      </tr>
    )
  }

  const columnLabels = {
    client: 'Client', week: 'Week', title: 'Blog Title',
    primary_keyword: 'Primary Keyword', secondary_keyword: 'Secondary Keyword',
    writer: 'Writer', search_volume: 'Search Vol.', outline: 'Outline',
    intern_status: 'Intern Status', required_by: 'Required By',
    topic_approval: 'Topic Approval', blog_status: 'Blog Status',
    blog_doc: 'Blog Doc', blog_internal_approval: 'Internal Approval', send_link: 'Send Link',
    date_sent: 'Sent For Appr.',
    blog_approval: 'Client Approval', approved_on: 'Approved On', blog_feedback: 'Feedback',
    link: 'Blog Link', published: 'Published', actions: ''
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Manage blog content across all clients</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1">
          <Filter className="w-4 h-4" /> Filters
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{pagination.total}</div>
          <div className="text-xs text-gray-500 mt-1">Total Posts</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{contentResponse?.stats?.published || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Published</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{contentResponse?.stats?.inProgress || 0}</div>
          <div className="text-xs text-gray-500 mt-1">In Progress</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-400">{contentResponse?.stats?.drafts || 0}</div>
          <div className="text-xs text-gray-500 mt-1">Drafts</div>
        </div>
      </div>

      <ClientSwitcher
        clients={clients}
        activeId={filterClient}
        onSelect={(id) => updateQueryParams({ client_id: id })}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-blue-50/50 border border-blue-100 rounded-lg shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Quick Add Content
          </h3>
          <div className="flex gap-2">
            <Select
              value={newContent.client_id || '__none__'}
              onValueChange={v => setNewContent(n => ({ ...n, client_id: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger className="h-9 text-xs w-48 bg-white border-blue-200">
                <SelectValue placeholder="Target Client..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" className="text-xs text-gray-400">Select client…</SelectItem>
                {safeArray(clients).map(c => <SelectItem key={c?.id} value={c?.id} className="text-xs">{c?.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <input
                type="text" value={newContent.blog_title}
                onChange={e => setNewContent(n => ({ ...n, blog_title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addContent()}
                placeholder="Topic / Blog Title..."
                className="w-full h-9 text-xs px-3 py-1 bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-all font-medium"
                disabled={addingContent}
              />
            </div>
            <Button
              onClick={addContent}
              disabled={addingContent || !newContent.blog_title.trim() || !newContent.client_id || newContent.client_id === '__none__'}
              className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              {addingContent ? 'Saving...' : 'Add Content'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-white border border-gray-200 rounded-lg items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            type="text" placeholder="Search blog titles..."
            value={localSearch} onChange={e => setLocalSearch(e.target.value)}
            className="h-8 text-xs pl-8 w-60 border-gray-200"
          />
        </div>

        {showFilters && (
          <>
            <Input
              type="text" placeholder="Week..."
              value={filterWeek} onChange={e => updateQueryParams({ week: e.target.value })}
              className="w-24 h-8 text-xs border-gray-200"
            />
            <Input
              type="text" placeholder="Writer..."
              value={filterWriter} onChange={e => updateQueryParams({ writer: e.target.value })}
              className="w-32 h-8 text-xs border-gray-200"
            />
            <Select value={filterTopicApproval} onValueChange={v => updateQueryParams({ topic_approval: v })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Topic Appr." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Topic Appr.</SelectItem>
                {TOPIC_APPROVALS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => updateQueryParams({ blog_status: v })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Blog Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Status</SelectItem>
                {BLOG_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterInternalApproval} onValueChange={v => updateQueryParams({ internal_approval: v })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Int. Appr." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Int. Appr.</SelectItem>
                {CONTENT_INTERNAL_APPROVALS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterClientApproval} onValueChange={v => updateQueryParams({ client_approval: v })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Client Appr." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Client Appr.</SelectItem>
                {BLOG_APPROVALS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPublished} onValueChange={v => updateQueryParams({ published: v })}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Published?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Publish</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        {(filterSearch || filterClient !== 'all' || filterStatus !== 'all' || filterWeek || filterWriter || filterTopicApproval !== 'all' || filterInternalApproval !== 'all' || filterClientApproval !== 'all' || filterPublished !== 'all') && (
          <button onClick={() => {
            updateQueryParams({
              client_id: 'all', blog_status: 'all', week: '', writer: '',
              topic_approval: 'all', internal_approval: 'all', client_approval: 'all',
              published: 'all', search: ''
            })
            setLocalSearch('')
          }} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">Clear</button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm text-xs">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd} modifiers={[restrictToHorizontalAxis]}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd} modifiers={[restrictToVerticalAxis]}>
            <table className="w-full text-sm" style={{ minWidth: '2500px', tableLayout: 'fixed' }}>
              <thead>
                {/* Serial number fixed header */}
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  <tr className="border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10 text-xs">
                    <th className="px-2 py-2.5 text-center text-gray-400 font-semibold bg-gray-50 border-r border-gray-100"
                      style={{ width: CONTENT_COLUMN_WIDTHS.serial, minWidth: CONTENT_COLUMN_WIDTHS.serial, position: 'sticky', left: 0, zIndex: 15 }}>
                      #
                    </th>
                    {columnOrder.map(colId => (
                      <SortableHeader key={colId} id={colId} label={columnLabels[colId] || colId} />
                    ))}
                  </tr>
                </SortableContext>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {loading ? (
                  <tr><td colSpan={columnOrder.length} className="py-16 text-center text-gray-400">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length} className="py-16 text-center text-gray-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                      {content.length === 0 ? 'No content calendar items yet.' : 'No items match your filters.'}
                    </td>
                  </tr>
                ) : (
                  <SortableContext items={filtered.map(i => i?.id)} strategy={verticalListSortingStrategy}>
                    {filtered.map((item, idx) => <SortableRow key={item.id} item={item} rowIndex={idx} />)}
                  </SortableContext>
                )}
              </tbody>
            </table>
          </DndContext>
        </DndContext>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          Drag headers to reorder columns
        </div>
        <Pagination
          total={pagination.total}
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={p => updateQueryParams({ page: p })}
        />
      </div>
      <ConfirmDialog config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  )
}

export default function ContentCalendarPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <ContentCalendarContent />
    </Suspense>
  )
}
