'use client'

import { Suspense, useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import { apiFetch, swrFetcher } from '@/lib/middleware/auth'
import { safeURL, safeJSON, safeArray } from '@/lib/safe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Pagination } from '@/components/shared/Pagination'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { EditableCell } from '@/components/table/EditableCell'
import { LinkCell } from '@/components/table/LinkCell'
import { Plus, ExternalLink, Trash2, Link2, Settings, BarChart3, FileText, GripVertical, GripHorizontal, Folder, Image, Library, Search, Mail, TrendingUp, FolderOpen, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
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
  STATUSES, CATEGORIES, PRIORITIES, APPROVALS, INTERNAL_APPROVALS, CONTENT_INTERNAL_APPROVALS, REPORT_TYPES, SERVICE_TYPES,
  OUTLINE_STATUSES, TOPIC_APPROVALS, BLOG_APPROVALS, BLOG_STATUSES, INTERN_STATUSES,
  statusColors, priorityColors, approvalColors, topicApprovalColors, blogStatusColors, internalApprovalColors, internStatusColors,
  TASK_COLUMN_WIDTHS, CONTENT_COLUMN_WIDTHS, EMAIL_COLUMN_WIDTHS, PAID_COLUMN_WIDTHS, STATUS_ORDER
} from '@/lib/constants'

// Shared components imported from @/components/

/** CommentsModal — expands task description/comments in a large textarea dialog */
function CommentsModal({ taskId, value, onClose, onSave }) {
  const [localComment, setLocalComment] = useState(value)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Task Description / Comments</DialogTitle>
          <DialogDescription>Add or edit a description for this task. Ctrl+Enter to save quickly.</DialogDescription>
        </DialogHeader>
        <textarea
          autoFocus
          value={localComment}
          onChange={e => setLocalComment(e.target.value)}
          rows={10}
          placeholder="Write a description, notes, or comments about this task..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { onSave(localComment || null); onClose() }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(localComment || null); onClose() }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function toAssignedIds(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  if (typeof raw === 'string' && raw.trim() !== '') return [raw]
  return []
}

function AssigneeCell({ task, members, memberMap, onSave }) {
  const ids = toAssignedIds(task?.assigned_to)
  const names = ids.map((id) => memberMap[id]).filter(Boolean)
  const label = names.length ? names.join(', ') : 'Unassigned'

  const setForMember = (memberId, checked) => {
    const nextSet = new Set(ids)
    if (checked) nextSet.add(memberId)
    else nextSet.delete(memberId)
    const next = [...nextSet]
    if (next.length === 0) onSave(null)
    else if (next.length === 1) onSave(next[0])
    else onSave(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="w-full text-left rounded px-1 py-0.5 min-h-[24px] hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all">
          <span className={`text-xs truncate block ${names.length ? 'text-gray-700' : 'text-gray-300'}`} title={label}>
            {label}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs">Assign Members</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={ids.length === 0}
          onCheckedChange={(checked) => { if (checked) onSave(null) }}
          className="text-xs"
        >
          Unassigned
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {safeArray(members).map((m) => (
          <DropdownMenuCheckboxItem
            key={m?.id}
            checked={ids.includes(m?.id)}
            onCheckedChange={(checked) => setForMember(m?.id, checked)}
            className="text-xs"
          >
            {m?.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ClientDetailPageContent() {
  const { id } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  // --- Tasks State (from URL) ---
  const tStatus = searchParams.get('status') || 'all'
  const tCategory = searchParams.get('category') || 'all'
  const tAssignee = searchParams.get('assigned_to') || 'all'
  const tPriority = searchParams.get('priority') || 'all'
  const tSearch = searchParams.get('search') || ''
  const tService = searchParams.get('service') || 'seo'
  const tSortBy = searchParams.get('t_sort_by') || ''
  const tSortDir = searchParams.get('t_sort_dir') === 'desc' ? 'desc' : 'asc'
  const tPage = parseInt(searchParams.get('page')) || 1

  const getServiceConfig = (srv) => {
    switch (srv) {
      case 'email':
        return {
          endpoint: '/api/email-tasks',
          label: 'Email Tasks',
          columns: ['selection', 'title', 'comments', 'status', 'assigned', 'link', 'internal_approval', 'send_link', 'campaign_live', 'live_data', 'client_approval', 'client_feedback', 'actions'],
          widths: EMAIL_COLUMN_WIDTHS
        }
      case 'paid':
        return {
          endpoint: '/api/paid-tasks',
          label: 'Paid Ads Tasks',
          columns: ['selection', 'title', 'comments', 'status', 'assigned', 'link', 'internal_approval', 'send_link', 'client_approval', 'client_feedback', 'actions'],
          widths: PAID_COLUMN_WIDTHS
        }
      default:
        return {
          endpoint: '/api/tasks',
          label: 'SEO Tasks',
          columns: ['selection', 'title', 'comments', 'category', 'status', 'priority', 'eta', 'assigned', 'link', 'internal_approval', 'send_link', 'client_approval', 'client_feedback', 'actions'],
          widths: TASK_COLUMN_WIDTHS
        }
    }
  }

  const serviceConfig = useMemo(() => getServiceConfig(tService), [tService])

  // --- Content State (from URL - prefixed with c_) ---
  const cStatus = searchParams.get('c_status') || 'all'
  const cWeek = searchParams.get('c_week') || ''
  const cWriter = searchParams.get('c_writer') || ''
  const cTopic = searchParams.get('c_topic') || 'all'
  const cInternal = searchParams.get('c_internal') || 'all'
  const cClientAppr = searchParams.get('c_client') || 'all'
  const cPublished = searchParams.get('c_published') || 'all'
  const cSearch = searchParams.get('c_search') || ''
  const cSortBy = searchParams.get('c_sort_by') || ''
  const cSortDir = searchParams.get('c_sort_dir') === 'desc' ? 'desc' : 'asc'
  const cPage = parseInt(searchParams.get('c_page')) || 1

  const updateQueryParams = (updates) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    })
    router.push(`/dashboard/clients/${id}?${params.toString()}`, { scroll: false })
  }

  // SWR hooks updated with params
  const taskParams = new URLSearchParams()
  taskParams.set('client_id', id)
  if (tStatus !== 'all') taskParams.set('status', tStatus)
  if (tCategory !== 'all') taskParams.set('category', tCategory)
  if (tAssignee !== 'all') taskParams.set('assigned_to', tAssignee)
  if (tPriority !== 'all') taskParams.set('priority', tPriority)
  if (tSearch) taskParams.set('search', tSearch)
  taskParams.set('page', tPage.toString())
  taskParams.set('limit', '50')
  taskParams.set('enrich', '0')

  const contentParams = new URLSearchParams()
  contentParams.set('client_id', id)
  if (cStatus !== 'all') contentParams.set('blog_status', cStatus)
  if (cWeek) contentParams.set('week', cWeek)
  if (cWriter) contentParams.set('writer', cWriter)
  if (cTopic !== 'all') contentParams.set('topic_approval', cTopic)
  if (cInternal !== 'all') contentParams.set('internal_approval', cInternal)
  if (cClientAppr !== 'all') contentParams.set('client_approval', cClientAppr)
  if (cPublished !== 'all') contentParams.set('published', cPublished)
  if (cSearch) contentParams.set('search', cSearch)
  contentParams.set('page', cPage.toString())
  contentParams.set('limit', '50')
  contentParams.set('enrich', '0')

  const { data: client, mutate: mutateClient, error: clientErr } = useSWR(id ? `/api/clients/${id}` : null, swrFetcher)
  const { data: tasks, mutate: mutateTasks } = useSWR(id ? `${serviceConfig.endpoint}?${taskParams.toString()}` : null, swrFetcher)
  const { data: reports, mutate: mutateReports } = useSWR(id ? `/api/reports?client_id=${id}` : null, swrFetcher)
  const { data: content, mutate: mutateContent } = useSWR(id ? `/api/content?${contentParams.toString()}` : null, swrFetcher)
  const { data: resources, mutate: mutateResources } = useSWR(id ? `/api/clients/${id}/resources` : null, swrFetcher)
  const { data: members } = useSWR('/api/team', swrFetcher)

  const [tLocalSearch, setTLocalSearch] = useState(tSearch)
  const [cLocalSearch, setCLocalSearch] = useState(cSearch)

  // Debounced search for Tasks
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tLocalSearch !== tSearch) {
        updateQueryParams({ search: tLocalSearch })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [tLocalSearch])

  // Debounced search for Content
  useEffect(() => {
    const timer = setTimeout(() => {
      if (cLocalSearch !== cSearch) {
        updateQueryParams({ c_search: cLocalSearch })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [cLocalSearch])

  const [saving, setSaving] = useState({})
  const [newTask, setNewTask] = useState({ title: '' })
  const [newContent, setNewContent] = useState({ blog_title: '' })
  const [addingTask, setAddingTask] = useState(false)
  const [addingContent, setAddingContent] = useState(false)
  const [showAddReport, setShowAddReport] = useState(false)
  const [reportForm, setReportForm] = useState({ title: '', report_type: 'Monthly SEO Report', report_url: '', report_date: '', notes: '' })
  const [showSettings, setShowSettings] = useState(false)
  const [showAddResource, setShowAddResource] = useState(false)
  const [resourceForm, setResourceForm] = useState({ name: '', url: '', type: 'link', category: 'Assets' })
  const [settingsForm, setSettingsForm] = useState({})
  const [taskColOrder, setTaskColOrder] = useState([])
  const [contentColOrder, setContentColOrder] = useState([])
  const [confirmConfig, setConfirmConfig] = useState(null)
  const [selectedTasks, setSelectedTasks] = useState(new Set())
  const [selectedContent, setSelectedContent] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeletingContent, setBulkDeletingContent] = useState(false)
  const taskSortConfig = useMemo(() => ({ field: tSortBy || null, direction: tSortDir }), [tSortBy, tSortDir])
  const contentSortConfig = useMemo(() => ({ field: cSortBy || null, direction: cSortDir }), [cSortBy, cSortDir])
  const addContentInputRef = useRef(null)
  // Comments modal state
  const [commentsModal, setCommentsModal] = useState(null) // { taskId, value }

  useEffect(() => {
    const savedTasks = localStorage.getItem(`client_tasks_col_order_${tService}`)
    const parsedTasks = safeJSON(savedTasks)
    if (parsedTasks && Array.isArray(parsedTasks)) {
      const currentCols = serviceConfig.columns
      const merged = parsedTasks.filter(id => currentCols.includes(id))
      currentCols.forEach(id => {
        if (!merged.includes(id)) merged.push(id)
      })
      setTaskColOrder(merged)
    } else {
      setTaskColOrder(serviceConfig.columns)
    }

    // Always nuke old stale orders
    localStorage.removeItem('client_content_col_order_v2')
    localStorage.removeItem('client_content_col_order_v3')

    const savedContent = localStorage.getItem('client_content_col_order_v4')
    const parsedContent = safeJSON(savedContent)
    const defaultContentCols = [
      'selection', 'week', 'title', 'primary_keyword', 'secondary_keyword', 'writer',
      'outline', 'intern_status', 'search_volume',
      'topic_approval', 'blog_status', 'blog_doc',
      'blog_internal_approval', 'send_link', 'date_sent', 'blog_approval', 'approved_on', 'blog_feedback',
      'link', 'required_by', 'published', 'comments', 'actions'
    ]
    if (parsedContent && Array.isArray(parsedContent)) {
      const cols = parsedContent.filter(c => c !== 'client')
      setContentColOrder(cols.includes('selection') ? cols : ['selection', ...cols.filter(c => c !== 'selection')])
    } else {
      setContentColOrder(defaultContentCols)
    }
  }, [tService, serviceConfig.columns])
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

  useEffect(() => {
    if (client) setSettingsForm(client)
  }, [client])

  const updateTask = async (taskId, field, value) => {
    const task = allTasks.find(t => t.id === taskId)
    if (!task) return

    setSaving(s => ({ ...s, [taskId]: true }))
    // allTasks is already the extracted array; wrap in envelope for mutate
    const optimistic = allTasks.map(t => t.id === taskId ? { ...t, [field]: value } : t)
    mutateTasks({ ...(tasks || {}), data: optimistic, items: optimistic }, false)

    try {
      const res = await apiFetch(`${serviceConfig.endpoint}/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          [field]: value,
          updated_at: task.updated_at
        })
      })

      if (res.status === 409) {
        const error = await res.json()
        alert(error.error || 'Concurrency error: Task was modified by another user.')
        mutateTasks()
      } else if (res.ok) {
        const updatedTask = await res.json()
        mutateTasks({ ...(tasks || {}), data: optimistic.map(t => t.id === taskId ? updatedTask : t), items: optimistic.map(t => t.id === taskId ? updatedTask : t) }, false)
      }
    } catch (e) {
      console.error('Update failed', e)
    }

    mutateTasks()
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  const publishTask = async (taskId) => {
    const task = safeArray(tasks?.data || tasks).find(t => t.id === taskId)
    setSaving(s => ({ ...s, [taskId]: true }))
    try {
      const res = await apiFetch(`${serviceConfig.endpoint}/${taskId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ updated_at: task?.updated_at })
      })
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Publish failed')
        mutateTasks()
      } else {
        const data = await res.json()
        if (data.task) {
          mutateTasks({ ...tasks, data: safeArray(tasks?.data || tasks).map(t => t.id === taskId ? data.task : t) }, false)
        }
      }
    } catch (e) {
      console.error('Publish failed', e)
    }
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  const publishContent = async (contentId) => {
    const item = allContent.find(c => c?.id === contentId)
    setSaving(s => ({ ...s, [`c_${contentId}`]: true }))
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
          const updated = allContent.map(c => c.id === contentId ? data.content : c)
          mutateContent({ ...(content || {}), data: updated }, false)
        }
      }
    } catch (e) {
      console.error('Content publish failed', e)
    }
    setSaving(s => ({ ...s, [`c_${contentId}`]: false }))
  }

  const addTask = async () => {
    if (!newTask.title.trim()) return
    setAddingTask(true)
    const res = await apiFetch(serviceConfig.endpoint, { method: 'POST', body: JSON.stringify({ ...newTask, client_id: id }) })
    if (res.ok) {
      setNewTask({ title: '' })
      mutateTasks()
    }
    setAddingTask(false)
  }

  const deleteTask = (taskId) => {
    setConfirmConfig({
      title: 'Delete Task',
      description: 'This will permanently delete the task. This cannot be undone.',
      onConfirm: async () => {
        await apiFetch(`${serviceConfig.endpoint}/${taskId}`, { method: 'DELETE' })
        setSelectedTasks(prev => {
          const next = new Set(prev)
          next.delete(taskId)
          return next
        })
        mutateTasks()
      }
    })
  }

  const deleteSelectedTasks = () => {
    if (selectedTasks.size === 0) return
    setConfirmConfig({
      title: `Delete ${selectedTasks.size} Tasks`,
      description: `This will permanently delete ${selectedTasks.size} selected tasks. This cannot be undone.`,
      onConfirm: async () => {
        setBulkDeleting(true)
        try {
          // Bulk delete should also use service endpoint 
          const bulkDeleteUrl = tService === 'seo' ? '/api/tasks/bulk' : `${serviceConfig.endpoint}/bulk`
          const res = await apiFetch(bulkDeleteUrl, {
            method: 'DELETE',
            body: JSON.stringify({ ids: Array.from(selectedTasks) })
          })
          if (res.ok) {
            setSelectedTasks(new Set())
            mutateTasks()
          } else {
            const err = await res.json()
            alert(err.error || 'Bulk delete failed')
          }
        } catch (e) {
          console.error('Bulk delete failed', e)
        } finally {
          setBulkDeleting(false)
        }
      }
    })
  }

  const toggleTaskSelection = (taskId) => {
    setSelectedTasks(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const toggleAllTasks = () => {
    if (selectedTasks.size === allTasks.length) {
      setSelectedTasks(new Set())
    } else {
      setSelectedTasks(new Set(allTasks.map(t => t.id)))
    }
  }

  const addReport = async (e) => {
    e.preventDefault()
    const res = await apiFetch('/api/reports', { method: 'POST', body: JSON.stringify({ ...reportForm, client_id: id }) })
    if (res.ok) {
      mutateReports()
      setShowAddReport(false)
      setReportForm({ title: '', report_type: 'Monthly SEO Report', report_url: '', report_date: '', notes: '' })
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.message || 'Failed to add report. Please check the URL and fields.')
      if (err.details) console.warn('Validation Details:', err.details)
    }
  }

  const [settingsError, setSettingsError] = useState('')

  const saveSettings = async (e) => {
    e.preventDefault()
    setSettingsError('')
    // Only send fields accepted by ClientSchema — strip forbidden fields
    // (id, slug, is_active, _id, created_at, updated_at etc. cause a 400)
    const { name, service_type, portal_password, npl_member_id, tpl_member_id, cpl_member_id, email } = settingsForm
    const payload = { name, service_type }
    if (portal_password) payload.portal_password = portal_password
    if (npl_member_id !== undefined) payload.npl_member_id = npl_member_id
    if (tpl_member_id !== undefined) payload.tpl_member_id = tpl_member_id
    if (cpl_member_id !== undefined) payload.cpl_member_id = cpl_member_id
    if (email !== undefined) payload.email = email

    try {
      const res = await apiFetch(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSettingsError(err?.message || `Save failed (${res.status})`)
        return
      }
      mutateClient()
      // Also refresh the main dashboard so renamed clients update there
      setShowSettings(false)
      setSettingsError('')
    } catch (e) {
      setSettingsError('Network error — could not save settings')
    }
  }

  const deleteClient = () => {
    setConfirmConfig({
      title: 'Delete Client',
      description: 'This will permanently delete the client and all related tasks, content, reports, and resources. This cannot be undone.',
      onConfirm: async () => {
        const res = await apiFetch(`/api/clients/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          alert(err?.error || 'Failed to delete client')
          return
        }
        setShowSettings(false)
        router.push('/dashboard')
      }
    })
  }

  const deleteReport = (reportId) => {
    setConfirmConfig({
      title: 'Delete Report',
      description: 'This will permanently delete the report. This cannot be undone.',
      onConfirm: async () => {
        await apiFetch(`/api/reports/${reportId}`, { method: 'DELETE' })
        mutateReports()
      }
    })
  }

  const addResource = async (e) => {
    e.preventDefault()
    const res = await apiFetch(`/api/clients/${id}/resources`, { method: 'POST', body: JSON.stringify(resourceForm) })
    if (res.ok) {
      mutateResources()
      setShowAddResource(false)
      setResourceForm({ name: '', url: '', type: 'link', category: 'Assets' })
    }
  }

  const deleteResource = (resId) => {
    setConfirmConfig({
      title: 'Delete Resource',
      description: 'This will permanently delete the resource link. This cannot be undone.',
      onConfirm: async () => {
        await apiFetch(`/api/clients/${id}/resources/${resId}`, { method: 'DELETE' })
        mutateResources()
      }
    })
  }

  const updateResource = async (resId, field, value) => {
    await apiFetch(`/api/clients/${id}/resources/${resId}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) })
    mutateResources()
  }

  const updateContent = async (contentId, field, value) => {
    setSaving(s => ({ ...s, [`c_${contentId}`]: true }))
    // allContent is the extracted array (content?.data || content via safeArray)
    const optimistic = allContent.map(c => c.id === contentId ? { ...c, [field]: value } : c)
    mutateContent({ ...(content || {}), data: optimistic }, false)

    const res = await apiFetch(`/api/content/${contentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        [field]: value,
        updated_at: allContent.find(c => c.id === contentId)?.updated_at
      })
    })
    if (res.status === 409) {
      alert('Concurrency error: Content has been modified by another user.')
      mutateContent()
    } else if (res.ok) {
      const updated = await res.json()
      mutateContent({ ...(content || {}), data: optimistic.map(c => c.id === contentId ? updated : c) }, false)
    } else {
      mutateContent()
    }
    setSaving(s => ({ ...s, [`c_${contentId}`]: false }))
  }

  const addContent = async () => {
    if (!newContent.blog_title.trim()) return
    setAddingContent(true)
    const res = await apiFetch('/api/content', { method: 'POST', body: JSON.stringify({ ...newContent, client_id: id }) })
    if (res.ok) {
      mutateContent()
      setNewContent({ blog_title: '' })
    }
    setAddingContent(false)
  }

  const deleteContent = (contentId) => {
    setConfirmConfig({
      title: 'Delete Content Item',
      description: 'This will permanently delete this blog post entry. This cannot be undone.',
      onConfirm: async () => {
        await apiFetch(`/api/content/${contentId}`, { method: 'DELETE' })
        setSelectedContent(prev => {
          const next = new Set(prev)
          next.delete(contentId)
          return next
        })
        mutateContent()
      }
    })
  }

  const deleteSelectedContent = () => {
    if (selectedContent.size === 0) return
    setConfirmConfig({
      title: `Delete ${selectedContent.size} Content Items`,
      description: `This will permanently delete ${selectedContent.size} selected items. This cannot be undone.`,
      onConfirm: async () => {
        setBulkDeletingContent(true)
        try {
          const res = await apiFetch('/api/content/bulk', {
            method: 'DELETE',
            body: JSON.stringify({ ids: Array.from(selectedContent) })
          })
          if (res.ok) {
            setSelectedContent(new Set())
            mutateContent()
          } else {
            const err = await res.json()
            alert(err.error || 'Bulk delete failed')
          }
        } catch (e) {
          console.error('Bulk delete failed', e)
        } finally {
          setBulkDeletingContent(false)
        }
      }
    })
  }

  const toggleContentSelection = (contentId) => {
    setSelectedContent(prev => {
      const next = new Set(prev)
      if (next.has(contentId)) next.delete(contentId)
      else next.add(contentId)
      return next
    })
  }

  const toggleAllContent = () => {
    if (selectedContent.size === allContent.length) {
      setSelectedContent(new Set())
    } else {
      setSelectedContent(new Set(allContent.map(c => c.id)))
    }
  }

  const allTasks = useMemo(() => safeArray(tasks?.data || tasks), [tasks])
  const tPagination = useMemo(() => ({
    total: tasks?.total || 0,
    page: tasks?.page || 1,
    totalPages: tasks?.totalPages || 1
  }), [tasks])

  const allReports = useMemo(() => safeArray(reports), [reports])

  const allContent = useMemo(() => safeArray(content?.data || content), [content])
  const cPagination = useMemo(() => ({
    total: content?.total || 0,
    page: content?.page || 1,
    totalPages: content?.totalPages || 1
  }), [content])
  const allResources = useMemo(() => safeArray(resources), [resources])
  const allMembers = useMemo(() => safeArray(members), [members])

  const completedTasks = useMemo(() => allTasks.filter(t => t?.status === 'Completed').length, [allTasks])
  const memberMap = useMemo(() => Object.fromEntries(allMembers.map(m => [m?.id, m?.name])), [allMembers])
  const getDateValue = (value) => {
    if (!value) return Number.NaN
    if (value instanceof Date) return value.getTime()
    const str = String(value).trim()
    if (!str) return Number.NaN
    const direct = Date.parse(str)
    if (!Number.isNaN(direct)) return direct
    const ddmmyyyy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
    if (ddmmyyyy) {
      const day = Number(ddmmyyyy[1])
      const month = Number(ddmmyyyy[2]) - 1
      let year = Number(ddmmyyyy[3])
      if (year < 100) year += 2000
      return new Date(year, month, day).getTime()
    }
    return Number.NaN
  }

  const getTaskSortableValue = (task, field) => {
    if (!task || !field) return ''
    if (field === 'assigned_name') return toAssignedIds(task.assigned_to).map((id) => memberMap[id]).filter(Boolean).join(', ')
    if (['eta_end', 'campaign_live_date', 'live_data'].includes(field)) return getDateValue(task[field])
    return task[field] ?? ''
  }

  const getContentSortableValue = (item, field) => {
    if (!item || !field) return ''
    if (['required_by', 'published_date', 'blog_approval_date', 'date_sent_for_approval'].includes(field)) return getDateValue(item[field])
    return item[field] ?? ''
  }

  const sortRows = (rows, sortConfig, getValue) => {
    if (!sortConfig.field) return rows
    const factor = sortConfig.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const aVal = getValue(a, sortConfig.field)
      const bVal = getValue(b, sortConfig.field)
      const aNum = typeof aVal === 'number'
      const bNum = typeof bVal === 'number'
      if (aNum && bNum) {
        const aNaN = Number.isNaN(aVal)
        const bNaN = Number.isNaN(bVal)
        if (aNaN && bNaN) return 0
        if (aNaN) return 1
        if (bNaN) return -1
        return (aVal - bVal) * factor
      }
      return String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base', numeric: true }) * factor
    })
  }

  const sortedTasks = useMemo(() => {
    if (taskSortConfig.field) return sortRows(allTasks, taskSortConfig, getTaskSortableValue)
    // Default order when no column sort is active: Completed → In Progress → To Be Started → Implemented → Blocked → others
    return [...allTasks].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a?.status || '')
      const bi = STATUS_ORDER.indexOf(b?.status || '')
      const aIdx = ai === -1 ? STATUS_ORDER.length : ai
      const bIdx = bi === -1 ? STATUS_ORDER.length : bi
      return aIdx - bIdx
    })
  }, [allTasks, taskSortConfig, memberMap])
  const sortedContent = useMemo(() => sortRows(allContent, contentSortConfig, getContentSortableValue), [allContent, contentSortConfig])
  const approvalCount = useMemo(() => allTasks.filter(t => t?.client_approval === 'Approved').length, [allTasks])
  const changesCount = useMemo(() => allTasks.filter(t => t?.client_approval === 'Required Changes' || t?.client_approval === 'Changes Required').length, [allTasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleTaskRowDragEnd = async (event) => {
    if (taskSortConfig.field) return
    const { active, over } = event
    if (!over) return
    if (active.id !== over.id) {
      const oldIndex = allTasks.findIndex((t) => t.id === active.id)
      const newIndex = allTasks.findIndex((t) => t.id === over.id)
      const reordered = arrayMove(allTasks, oldIndex, newIndex)
      mutateTasks({ ...tasks, data: reordered }, false)

      try {
        const reorderUrl = tService === 'seo' ? '/api/tasks/reorder' : `${serviceConfig.endpoint}/reorder`
        await apiFetch(reorderUrl, {
          method: 'PUT',
          body: JSON.stringify({ ids: reordered.map(t => t.id) })
        })
      } catch (e) {
        console.error('Failed to persist task order', e)
        mutateTasks()
      }
    }
  }

  const handleTaskColDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setTaskColOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const updated = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem(`client_tasks_col_order_${tService}`, JSON.stringify(updated))
        return updated
      })
    }
  }

  const handleContentRowDragEnd = async (event) => {
    if (contentSortConfig.field) return
    const { active, over } = event
    if (!over) return
    if (active.id !== over.id) {
      const oldIndex = allContent.findIndex((c) => c.id === active.id)
      const newIndex = allContent.findIndex((c) => c.id === over.id)
      const reordered = arrayMove(allContent, oldIndex, newIndex)
      mutateContent({ ...content, data: reordered }, false)

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

  const handleContentColDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setContentColOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const updated = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem('client_content_col_order_v3', JSON.stringify(updated))
        return updated
      })
    }
  }

  const handleSort = (field, type = 'task') => {
    if (!field) return
    if (type === 'task') {
      const nextDirection = taskSortConfig.field === field && taskSortConfig.direction === 'asc' ? 'desc' : 'asc'
      updateQueryParams({ t_sort_by: field, t_sort_dir: nextDirection, page: 1 })
      return
    }
    const nextDirection = contentSortConfig.field === field && contentSortConfig.direction === 'asc' ? 'desc' : 'asc'
    updateQueryParams({ c_sort_by: field, c_sort_dir: nextDirection, c_page: 1 })
  }

  if (!client && !clientErr) return <div className="p-8 text-gray-400">Loading...</div>
  if (!client || clientErr) return <div className="p-8 text-gray-400">Client not found</div>

  // --- Sortable Components ---
  const SortableHeader = ({ id, label, sortField: sField, type = 'task' }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'header' })
    const widths = type === 'task' ? serviceConfig.widths : CONTENT_COLUMN_WIDTHS
    const isContent = type === 'content'
    const isSticky = (isContent && (id === 'title' || id === 'week' || id === 'serial')) || (!isContent && (id === 'title' || id === 'serial' || id === 'selection'))

    // For Content: Serial(0), Week(40), Title(120)
    // For Tasks: Serial(0), Selection(40), Title(100)
    const leftPos = isContent
      ? (id === 'serial' ? '0px' : id === 'week' ? '40px' : '120px')
      : (id === 'serial' ? '0px' : id === 'selection' ? '40px' : '100px')

    const currentWidth = id === 'serial' ? '40px' : (widths[id] || 'auto')

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 30 : (isSticky ? 20 : 0),
      width: currentWidth,
      minWidth: currentWidth,
      ...(isSticky ? { position: 'sticky', left: leftPos, background: '#f9fafb', zIndex: 25, borderRight: '1px solid #f3f4f6', boxShadow: id === 'title' ? '4px 0 8px -4px rgba(0,0,0,0.1)' : '' } : {})
    }

    const isTask = type === 'task'
    const items = isTask ? allTasks : allContent
    const selected = isTask ? selectedTasks : selectedContent
    const toggleAll = isTask ? toggleAllTasks : toggleAllContent

    return (
      <th ref={setNodeRef} style={style} className={`text-left px-3 py-2.5 font-semibold text-gray-600 bg-gray-50 border-r border-gray-100 last:border-0 ${isDragging ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          {id === 'selection' ? (
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              checked={items.length > 0 && selected.size === items.length}
              onChange={toggleAll}
            />
          ) : (
            <div {...attributes} {...listeners} className="cursor-grab hover:text-blue-500 flex-shrink-0">
              <GripHorizontal className="w-3 h-3" />
            </div>
          )}
          <button
            type="button"
            onClick={() => handleSort(sField, type)}
            className={`truncate inline-flex items-center gap-1 ${sField ? 'cursor-pointer hover:text-gray-900' : 'cursor-default'}`}
            title={label}
            disabled={!sField}
          >
            <span className="truncate">{label}</span>
            {sField && (
              (type === 'task' ? taskSortConfig.field : contentSortConfig.field) === sField
                ? ((type === 'task' ? taskSortConfig.direction : contentSortConfig.direction) === 'asc'
                  ? <ArrowUp className="w-3 h-3 flex-shrink-0" />
                  : <ArrowDown className="w-3 h-3 flex-shrink-0" />)
                : <ArrowUpDown className="w-3 h-3 flex-shrink-0 text-gray-400" />
            )}
          </button>
        </div>
      </th>
    )
  }

  const TaskSortableRow = ({ task }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task?.id || 'unknown' })
    if (!task?.id) return null
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 40 : 10 }

    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        <td className="px-2 py-1.5 text-center text-gray-400 font-mono text-[11px] bg-gray-50/50 border-r border-gray-100 select-none"
          style={{ width: '40px', minWidth: '40px', position: 'sticky', left: 0, zIndex: 20 }}>
          {sortedTasks.findIndex(t => t.id === task.id) + 1}
        </td>
        {safeArray(taskColOrder).map(colId => {
          const isTaskSticky = colId === 'title' || colId === 'selection'
          const taskLeftPos = colId === 'selection' ? '40px' : '100px'
          const taskStickyStyle = isTaskSticky ? {
            position: 'sticky',
            left: taskLeftPos,
            background: '#fff',
            zIndex: 20,
            borderRight: '1px solid #f3f4f6',
            boxShadow: colId === 'title' ? '4px 0 8px -4px rgba(0,0,0,0.1)' : ''
          } : {}
          const currentWidth = serviceConfig.widths[colId]
          return (
            <td key={colId} className={`px-3 py-1.5 overflow-hidden ${!isTaskSticky && (colId === 'internal_approval' || colId === 'send_link') ? 'bg-gray-50/50' : ''}`}
              style={{ width: currentWidth, minWidth: currentWidth, ...taskStickyStyle }}>
              {colId === 'selection' && (
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    checked={selectedTasks.has(task.id)}
                    onChange={() => toggleTaskSelection(task.id)}
                  />
                </div>
              )}
              {
                colId === 'title' && (
                  <div className="flex items-center gap-2">
                    {!taskSortConfig.field && (
                      <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <GripVertical className="w-3 h-3" />
                      </div>
                    )}
                    {saving[task.id] && <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                    <EditableCell value={task.title} onSave={v => updateTask(task.id, 'title', v)} />
                  </div>
                )
              }
              {colId === 'category' && <EditableCell value={task.category} type="select" options={CATEGORIES} onSave={v => updateTask(task.id, 'category', v)} />}
              {colId === 'status' && <EditableCell value={task.status} type="status" options={STATUSES} onSave={v => updateTask(task.id, 'status', v)} />}
              {colId === 'priority' && <EditableCell value={task.priority} type="priority" options={PRIORITIES} onSave={v => updateTask(task.id, 'priority', v)} />}
              {colId === 'eta' && <EditableCell value={task.eta_end} type="date" onSave={v => updateTask(task.id, 'eta_end', v)} />}
              {
                colId === 'assigned' && (
                  <AssigneeCell
                    task={task}
                    members={allMembers}
                    memberMap={memberMap}
                    onSave={(value) => updateTask(task.id, 'assigned_to', value)}
                  />
                )
              }
              {colId === 'link' && <LinkCell value={task.link_url} onSave={v => updateTask(task.id, 'link_url', v)} />}
              {
                colId === 'internal_approval' && (
                  <EditableCell
                    value={task.internal_approval || 'Pending'}
                    type="internal_approval"
                    options={INTERNAL_APPROVALS}
                    disabled={task.status !== 'Completed' && task.status !== 'Implemented'}
                    onSave={v => updateTask(task.id, 'internal_approval', v)}
                  />
                )
              }
              {colId === 'campaign_live' && <EditableCell value={task.campaign_live_date} type="date" onSave={v => updateTask(task.id, 'campaign_live_date', v)} />}
              {colId === 'live_data' && <EditableCell value={task.live_data} type="date" onSave={v => updateTask(task.id, 'live_data', v)} />}
              {
                colId === 'send_link' && (
                  <Button
                    size="sm"
                    variant={task.client_link_visible ? "ghost" : "default"}
                    className={`h-7 px-2 text-[10px] uppercase tracking-wider font-bold ${task.client_link_visible ? 'text-green-600' : ''}`}
                    disabled={
                      (task.status !== 'Completed' && task.status !== 'Implemented') ||
                      task.internal_approval !== 'Approved' ||
                      !task.link_url ||
                      task.client_link_visible === true
                    }
                    onClick={() => publishTask(task.id)}
                  >
                    {task.client_link_visible ? 'Sent' : 'Send Link'}
                  </Button>
                )
              }
              {colId === 'client_approval' && <EditableCell value={task.client_approval} type="approval" disabled={true} />}
              {colId === 'client_feedback' && (
                <div className="max-w-[150px]">
                  {task.client_approval === 'Required Changes' ? (
                    <div className="text-[10px] text-red-600 bg-red-50 p-1 rounded border border-red-100 line-clamp-2" title={task.client_feedback_note}>
                      {task.client_feedback_note}
                    </div>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </div>
              )}
              {colId === 'comments' && (
                <div
                  className="cursor-pointer px-1 py-0.5 rounded hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[24px] max-w-[200px] overflow-hidden"
                  onClick={() => setCommentsModal({ taskId: task.id, value: task.comments || '' })}
                  title={task.comments || 'Click to add description'}
                >
                  {task.comments
                    ? <span className="text-xs text-gray-600 line-clamp-2 block">{task.comments}</span>
                    : <span className="text-gray-300 text-xs">Add description...</span>}
                </div>
              )}
              {colId === 'actions' && (
                <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </td>
          );
        })}
      </tr>
    )
  }

  const ContentSortableRow = ({ item }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item?.id || 'unknown' })
    if (!item?.id) return null
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 40 : 10 }
    const rowIndex = sortedContent.findIndex(i => i.id === item.id)
    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        <td className="px-2 py-1.5 text-center text-gray-400 font-mono text-[11px] bg-white border-r border-gray-100 select-none"
          style={{ width: '40px', minWidth: '40px', position: 'sticky', left: 0, background: '#fff', zIndex: 20 }}>
          {rowIndex + 1}
        </td>
        {safeArray(contentColOrder).map(colId => {
          const isSticky = colId === 'title' || colId === 'week'
          const leftPos = colId === 'week' ? '40px' : '120px'
          const stickyStyle = isSticky ? { position: 'sticky', left: leftPos, background: '#fff', zIndex: 20, borderRight: '1px solid #f3f4f6', boxShadow: isSticky ? '4px 0 8px -4px rgba(0,0,0,0.1)' : '' } : {}
          return (
            <td key={colId} className={`px-3 py-1.5 overflow-hidden ${colId === 'blog_internal_approval' || colId === 'send_link' ? 'bg-gray-50/50' : ''}`}
              style={{ width: CONTENT_COLUMN_WIDTHS[colId], minWidth: CONTENT_COLUMN_WIDTHS[colId], ...stickyStyle }}>
              {colId === 'selection' && (
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                    checked={selectedContent.has(item.id)}
                    onChange={() => toggleContentSelection(item.id)}
                  />
                </div>
              )}
              {colId === 'week' && (
                <div className="flex items-center gap-2">
                  {!contentSortConfig.field && (
                    <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <GripVertical className="w-3 h-3" />
                    </div>
                  )}
                  <EditableCell value={item.week} onSave={v => updateContent(item.id, 'week', v)} placeholder="W1" />
                </div>
              )}
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
              {colId === 'topic_approval' && (
                <EditableCell
                  value={item.topic_approval_status || 'Pending'}
                  type="topic_approval"
                  options={TOPIC_APPROVALS}
                  onSave={v => updateContent(item.id, 'topic_approval_status', v)}
                />
              )}
              {colId === 'blog_status' && (
                <EditableCell
                  value={item.blog_status || 'Draft'}
                  type="blog_status"
                  options={BLOG_STATUSES}
                  onSave={v => updateContent(item.id, 'blog_status', v)}
                />
              )}
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
                <EditableCell value={item.blog_approval_status || 'Pending Review'} type="blog_approval" disabled={true} />
              )}
              {colId === 'approved_on' && (
                <span className="text-xs text-gray-500">{item.blog_approval_date || '—'}</span>
              )}
              {colId === 'blog_feedback' && (
                <div className="max-w-[150px]">
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
              {colId === 'comments' && <EditableCell value={item.comments} onSave={v => updateContent(item.id, 'comments', v)} placeholder="Notes..." />}
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

  const taskColLabels = {
    selection: '',
    title: 'Task', category: 'Category', status: 'Status', priority: 'Priority',
    eta: 'ETA End', assigned: 'Assigned', link: 'Link', internal_approval: 'Internal Approval',
    campaign_live: 'Campaign Live', live_data: 'Live Data',
    send_link: 'Send Link', client_approval: 'Client Approval', client_feedback: 'Feedback', comments: 'Comments', actions: ''
  }
  const taskSortFields = {
    title: 'title',
    category: 'category',
    status: 'status',
    priority: 'priority',
    eta: 'eta_end',
    assigned: 'assigned_name',
    link: 'link_url',
    internal_approval: 'internal_approval',
    campaign_live: 'campaign_live_date',
    live_data: 'live_data',
    client_approval: 'client_approval',
    client_feedback: 'client_feedback_note',
    comments: 'comments'
  }

  const contentColLabels = {
    selection: '',
    week: 'Week', title: 'Blog Title',
    primary_keyword: 'Primary Keyword', secondary_keyword: 'Secondary Keyword',
    writer: 'Writer', search_volume: 'Search Vol.', outline: 'Outline',
    intern_status: 'Intern Status', required_by: 'Required By',
    topic_approval: 'Topic Approval', blog_status: 'Blog Status',
    blog_doc: 'Blog Doc', blog_internal_approval: 'Internal Approval', send_link: 'Send Link',
    date_sent: 'Sent For Appr.',
    blog_approval: 'Client Approval', approved_on: 'Approved On', blog_feedback: 'Feedback',
    link: 'Blog Link', published: 'Published', comments: 'Notes', actions: ''
  }
  const contentSortFields = {
    week: 'week',
    title: 'blog_title',
    primary_keyword: 'primary_keyword',
    secondary_keyword: 'secondary_keywords',
    writer: 'writer',
    outline: 'outline_link',
    intern_status: 'intern_status',
    search_volume: 'search_volume',
    required_by: 'required_by',
    topic_approval: 'topic_approval_status',
    blog_status: 'blog_status',
    blog_doc: 'blog_doc_link',
    blog_internal_approval: 'blog_internal_approval',
    send_link: 'client_link_visible_blog',
    date_sent: 'date_sent_for_approval',
    blog_approval: 'blog_approval_status',
    approved_on: 'blog_approval_date',
    blog_feedback: 'blog_client_feedback_note',
    link: 'blog_link',
    published: 'published_date',
    comments: 'comments'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/dashboard" className="hover:text-gray-600">Dashboard</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{client?.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{client?.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{client?.service_type}</span>
            <a href={`${BASE_URL}/portal/${client?.slug}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              Portal Link <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1">
          <Settings className="w-4 h-4" /> Settings
        </Button>
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="mb-6 p-1 bg-gray-100/50 border border-gray-200/50 rounded-xl flex h-auto gap-1">
          <TabsTrigger value="timeline" className="px-6 py-2.5 rounded-lg font-bold text-gray-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all border border-transparent data-[state=active]:border-gray-200 hover:text-gray-700">
            Timeline Tracker
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2 px-6 py-2.5 rounded-lg font-bold text-gray-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all border border-transparent data-[state=active]:border-gray-200 hover:text-gray-700">
            <FileText className="w-4 h-4" /> Content Calendar ({allContent.length})
          </TabsTrigger>
          <TabsTrigger value="resources" className="gap-2 px-6 py-2.5 rounded-lg font-bold text-gray-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all border border-transparent data-[state=active]:border-gray-200 hover:text-gray-700">
            <FolderOpen className="w-4 h-4" /> Resources
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2 px-6 py-2.5 rounded-lg font-bold text-gray-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm transition-all border border-transparent data-[state=active]:border-gray-200 hover:text-gray-700">
            <BarChart3 className="w-4 h-4" /> Reports
          </TabsTrigger>
        </TabsList>

        {/* ── Timeline Tab ───────────────────────────────────────────────── */}
        <TabsContent value="timeline">
          <div className="flex items-center justify-between mb-4">
            <div className="flex bg-gray-100 p-1.5 rounded-xl border border-gray-200 shadow-inner">
              <button
                onClick={() => updateQueryParams({ service: 'seo', page: 1 })}
                className={`flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${tService === 'seo' ? 'bg-blue-600 text-white shadow-md transform scale-105' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}
              >
                <Search className="w-3.5 h-3.5" />
                SEO
              </button>
              <button
                onClick={() => updateQueryParams({ service: 'email', page: 1 })}
                className={`flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${tService === 'email' ? 'bg-purple-600 text-white shadow-md transform scale-105' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email
              </button>
              <button
                onClick={() => updateQueryParams({ service: 'paid', page: 1 })}
                className={`flex items-center gap-2 px-6 py-2.5 text-xs font-bold rounded-lg transition-all duration-200 ${tService === 'paid' ? 'bg-orange-600 text-white shadow-md transform scale-105' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Paid Ads
              </button>
            </div>
            {(tSearch || tStatus !== 'all' || tCategory !== 'all' || tPriority !== 'all' || tAssignee !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-gray-400"
                onClick={() => {
                  updateQueryParams({ status: 'all', category: 'all', priority: 'all', assigned_to: 'all', search: '', page: 1 })
                  setTLocalSearch('')
                }}
              >
                Clear filters
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-blue-50/50 border border-blue-100 rounded-lg shadow-sm">
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Quick Add {serviceConfig.label.slice(0, -1)}
              </h3>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text" value={newTask.title}
                    onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addTask()}
                    placeholder={`What ${serviceConfig.label.toLowerCase()} needs to be done for this client?`}
                    className="w-full h-9 text-xs px-3 py-1 bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-all"
                    disabled={addingTask}
                  />
                </div>
                <Button
                  onClick={addTask}
                  disabled={addingTask || !newTask.title.trim()}
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  {addingTask ? 'Saving...' : 'Add Task'}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white border border-gray-200 rounded-lg">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <Input
                type="text" placeholder="Search tasks..."
                value={tLocalSearch} onChange={e => setTLocalSearch(e.target.value)}
                className="h-8 text-xs pl-8 w-48 border-gray-200"
              />
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-gray-50 border border-gray-100 rounded-md mr-2">
              <Button
                variant={tStatus === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-7 text-xs px-3 font-medium ${tStatus === 'all' ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => updateQueryParams({ status: 'all', page: 1 })}
              >
                All
              </Button>
              <Button
                variant={tStatus === 'Completed' ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-7 text-xs px-3 font-medium ${tStatus === 'Completed' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => updateQueryParams({ status: 'Completed', page: 1 })}
              >
                Completed
              </Button>
              <Button
                variant={tStatus === 'not_completed' ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-7 text-xs px-3 font-medium ${tStatus === 'not_completed' ? 'bg-white shadow-sm text-amber-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => updateQueryParams({ status: 'not_completed', page: 1 })}
              >
                Not Completed
              </Button>
            </div>

            <Select value={tStatus === 'not_completed' ? 'all' : tStatus} onValueChange={v => updateQueryParams({ status: v, page: 1 })}>
              <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Any Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Any Status</SelectItem>
                {STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>

            {tService === 'seo' && (
              <Select value={tCategory} onValueChange={v => updateQueryParams({ category: v, page: 1 })}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Category</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {tService === 'seo' && (
              <Select value={tPriority} onValueChange={v => updateQueryParams({ priority: v, page: 1 })}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Priority</SelectItem>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <Select value={tAssignee} onValueChange={v => updateQueryParams({ assigned_to: v, page: 1 })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Assignee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Assignee</SelectItem>
                {allMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="flex-1" />

            {selectedTasks.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={deleteSelectedTasks}
                disabled={bulkDeleting}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {selectedTasks.size}
              </Button>
            )}
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskColDragEnd} modifiers={[restrictToHorizontalAxis]}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskRowDragEnd} modifiers={[restrictToVerticalAxis]}>
                <table className="w-full text-sm" style={{ minWidth: '1800px', tableLayout: 'fixed' }}>
                  <thead>
                    <SortableContext items={taskColOrder} strategy={horizontalListSortingStrategy}>
                      <tr className="border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
                        <th className="px-2 py-2.5 text-center text-gray-400 font-semibold bg-gray-50 border-r border-gray-100" style={{ width: '40px', minWidth: '40px' }}>#</th>
                        {safeArray(taskColOrder).map(colId => (
                          <SortableHeader key={colId} id={colId} label={taskColLabels[colId]} sortField={taskSortFields[colId]} type="task" />
                        ))}
                      </tr>
                    </SortableContext>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={taskColOrder.length} className="px-4 py-16 text-center text-gray-400">
                          No tasks yet. Add your first task below.
                        </td>
                      </tr>
                    ) : (
                      <SortableContext items={sortedTasks.map(t => t?.id)} strategy={verticalListSortingStrategy}>
                        {sortedTasks.map(task => <TaskSortableRow key={task?.id} task={task} />)}
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
              total={tPagination.total}
              page={tPagination.page}
              totalPages={tPagination.totalPages}
              onPageChange={p => updateQueryParams({ page: p })}
            />
          </div>
        </TabsContent>

        {/* ── Content Calendar Tab ─────────────────────────────────────────── */}
        <TabsContent value="content">
          <div className="flex flex-wrap items-center gap-3 mb-4 p-4 bg-blue-50/50 border border-blue-100 rounded-lg shadow-sm">
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Quick Add Content
              </h3>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text" value={newContent.blog_title}
                    onChange={e => setNewContent(n => ({ ...n, blog_title: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addContent()}
                    placeholder="Blog Topic/Title..."
                    className="w-full h-9 text-xs px-3 py-1 bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-all font-medium"
                    disabled={addingContent}
                  />
                </div>
                <Button
                  onClick={addContent}
                  disabled={addingContent || !newContent.blog_title.trim()}
                  className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  {addingContent ? 'Saving...' : 'Add Content'}
                </Button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-white border border-gray-200 rounded-lg">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <Input
                type="text" placeholder="Search blog titles..."
                value={cLocalSearch} onChange={e => setCLocalSearch(e.target.value)}
                className="h-8 text-xs pl-8 w-48 border-gray-200"
              />
            </div>
            <Input
              type="text" placeholder="Week..."
              value={cWeek} onChange={e => updateQueryParams({ c_week: e.target.value, c_page: 1 })}
              className="w-20 h-8 text-xs border-gray-200"
            />
            <Input
              type="text" placeholder="Writer..."
              value={cWriter} onChange={e => updateQueryParams({ c_writer: e.target.value, c_page: 1 })}
              className="w-28 h-8 text-xs border-gray-200"
            />
            <Select value={cTopic} onValueChange={v => updateQueryParams({ c_topic: v, c_page: 1 })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Topic Appr." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Topic Appr.</SelectItem>
                {TOPIC_APPROVALS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cStatus} onValueChange={v => updateQueryParams({ c_status: v, c_page: 1 })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Blog Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Status</SelectItem>
                {BLOG_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cInternal} onValueChange={v => updateQueryParams({ c_internal: v, c_page: 1 })}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Int. Appr." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Int. Appr.</SelectItem>
                {CONTENT_INTERNAL_APPROVALS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cPublished} onValueChange={v => updateQueryParams({ c_published: v, c_page: 1 })}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Published?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Publish</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>

            {(cSearch || cStatus !== 'all' || cWeek || cWriter || cTopic !== 'all' || cInternal !== 'all' || cPublished !== 'all') && (
              <button onClick={() => {
                updateQueryParams({
                  c_status: 'all', c_week: '', c_writer: '',
                  c_topic: 'all', c_internal: 'all', c_client: 'all',
                  c_published: 'all', c_search: '', c_page: 1
                })
                setCLocalSearch('')
              }} className="text-xs text-blue-600 hover:text-blue-800 font-medium ml-1">Clear</button>
            )}

            <div className="flex-1" />

            {selectedContent.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 px-3 text-xs gap-1.5 mr-2"
                onClick={deleteSelectedContent}
                disabled={bulkDeletingContent}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {selectedContent.size}
              </Button>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleContentColDragEnd} modifiers={[restrictToHorizontalAxis]}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleContentRowDragEnd} modifiers={[restrictToVerticalAxis]}>
                <table className="w-full text-sm" style={{ minWidth: '2000px', tableLayout: 'fixed' }}>
                  <thead>
                    <SortableContext items={contentColOrder} strategy={horizontalListSortingStrategy}>
                      <tr className="border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
                        <th className="px-2 py-2.5 text-center text-gray-400 font-semibold bg-gray-50 border-r border-gray-100"
                          style={{ width: '40px', minWidth: '40px', position: 'sticky', left: 0, zIndex: 15 }}>
                          #
                        </th>
                        {safeArray(contentColOrder).map(colId => (
                          <SortableHeader key={colId} id={colId} label={contentColLabels[colId]} sortField={contentSortFields[colId]} type="content" />
                        ))}
                      </tr>
                    </SortableContext>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedContent.length === 0 ? (
                      <tr>
                        <td colSpan={contentColOrder.length} className="px-4 py-16 text-center text-gray-400">
                          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                          No content calendar items yet. Add your first blog post below.
                        </td>
                      </tr>
                    ) : (
                      <SortableContext items={sortedContent.map(i => i?.id)} strategy={verticalListSortingStrategy}>
                        {sortedContent.map(item => (
                          <ContentSortableRow key={item?.id} item={item} />
                        ))}
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
              total={cPagination.total}
              page={cPagination.page}
              totalPages={cPagination.totalPages}
              onPageChange={p => updateQueryParams({ c_page: p })}
            />
          </div>
        </TabsContent>

        {/* ── Resources Tab ────────────────────────────────────────────── */}
        <TabsContent value="resources">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowAddResource(true)} size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> Add Resource
            </Button>
          </div>
          {allResources.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Library className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              No resources yet. Add logos, brand guides, or media links.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {safeArray(allResources).map(res => (
                <Card key={res?.id} className="border border-gray-200 hover:shadow-md transition-shadow group">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                        {res.type === 'image' ? <Image className="w-5 h-5" /> :
                          res.type === 'folder' ? <Folder className="w-5 h-5" /> :
                            <Link2 className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">{res.category || 'Asset'}</span>
                          <button onClick={() => deleteResource(res.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="font-semibold text-gray-900 text-sm truncate">{res.name}</p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {safeURL(res.url)?.hostname || 'resource link'}
                        </p>
                        <a href={res.url} target="_blank" rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-800 transition-colors w-full justify-center">
                          Open Resource <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Reports Tab ───────────────────────────────────────────────── */}
        <TabsContent value="reports">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowAddReport(true)} size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> Add Report
            </Button>
          </div>
          {allReports.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              No reports yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {safeArray(allReports).map(report => (
                <Card key={report?.id} className="border border-gray-200 hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">{report.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{report.report_type}</p>
                        <p className="text-xs text-gray-400 mt-1">{report.report_date}</p>
                        {report.notes && <p className="text-xs text-gray-500 mt-2">{report.notes}</p>}
                      </div>
                      <button onClick={() => deleteReport(report.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <a href={report.report_url} target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
                      View Report <ExternalLink className="w-3 h-3" />
                    </a>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <Dialog open={showAddResource} onOpenChange={setShowAddResource}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Resource</DialogTitle></DialogHeader>
          <form onSubmit={addResource} className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={resourceForm.name} onChange={e => setResourceForm(f => ({ ...f, name: e.target.value }))} required placeholder="Primary Logo - Vector" className="mt-1" />
            </div>
            <div>
              <Label>Resource URL</Label>
              <Input value={resourceForm.url} onChange={e => setResourceForm(f => ({ ...f, url: e.target.value }))} required placeholder="https://drive.google.com/..." className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={resourceForm.type} onValueChange={v => setResourceForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['link', 'image', 'video', 'folder'].map(t => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={resourceForm.category} onValueChange={v => setResourceForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Assets', 'Branding', 'Media Library', 'Other'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddResource(false)}>Cancel</Button>
              <Button type="submit">Add Resource</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddReport} onOpenChange={setShowAddReport}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Report</DialogTitle></DialogHeader>
          <form onSubmit={addReport} className="space-y-3">
            <div><Label>Title</Label><Input value={reportForm.title} onChange={e => setReportForm(f => ({ ...f, title: e.target.value }))} required placeholder="May 2025 SEO Report" className="mt-1" /></div>
            <div><Label>Type</Label>
              <Select value={reportForm.report_type} onValueChange={v => setReportForm(f => ({ ...f, report_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{REPORT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Report URL</Label><Input value={reportForm.report_url} onChange={e => setReportForm(f => ({ ...f, report_url: e.target.value }))} required placeholder="https://docs.google.com/..." className="mt-1" /></div>
            <div><Label>Date</Label><Input type="date" value={reportForm.report_date} onChange={e => setReportForm(f => ({ ...f, report_date: e.target.value }))} className="mt-1" /></div>
            <div><Label>Notes</Label><Input value={reportForm.notes} onChange={e => setReportForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="mt-1" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddReport(false)}>Cancel</Button>
              <Button type="submit">Add</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader><DialogTitle>Client Settings</DialogTitle></DialogHeader>
          <form onSubmit={saveSettings} className="space-y-3">
            <div><Label>Name</Label><Input value={settingsForm.name || ''} onChange={e => setSettingsForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Service Type</Label>
              <Select value={settingsForm.service_type || 'SEO'} onValueChange={v => setSettingsForm(f => ({ ...f, service_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Portal Password <span className="text-gray-400 text-xs">(leave empty for public)</span></Label>
              <Input value={settingsForm.portal_password || ''} onChange={e => setSettingsForm(f => ({ ...f, portal_password: e.target.value }))} placeholder="Optional" className="mt-1" />
            </div>
            <div>
              <Label>Contact Emails <span className="text-gray-400 text-xs">(comma-separated)</span></Label>
              <Input value={settingsForm.email || ''} onChange={e => setSettingsForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. john@comp.com, sara@comp.com" className="mt-1" />
            </div>
            {settingsError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{settingsError}</p>}
            <DialogFooter>
              <Button type="button" variant="destructive" className="mr-auto" onClick={deleteClient}>
                Delete Client
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog config={confirmConfig} onClose={() => setConfirmConfig(null)} />

      {commentsModal && (
        <CommentsModal
          taskId={commentsModal.taskId}
          value={commentsModal.value}
          onClose={() => setCommentsModal(null)}
          onSave={(val) => updateTask(commentsModal.taskId, 'comments', val)}
        />
      )}
    </div>

  )
}

export default function ClientDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading client data...</div>}>
      <ClientDetailPageContent />
    </Suspense>
  )
}
