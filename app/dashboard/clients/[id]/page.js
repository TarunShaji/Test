'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import { apiFetch, swrFetcher } from '@/lib/auth'
import { safeURL, safeJSON, safeArray } from '@/lib/safe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { EditableCell } from '@/components/EditableCell'
import { LinkCell } from '@/components/LinkCell'
import { Plus, ExternalLink, Trash2, Link2, Settings, BarChart3, FileText, GripVertical, GripHorizontal, Folder, Image, Library } from 'lucide-react'
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
  STATUSES, CATEGORIES, PRIORITIES, APPROVALS, INTERNAL_APPROVALS, CONTENT_INTERNAL_APPROVALS, REPORT_TYPES, SERVICE_TYPES,
  OUTLINE_STATUSES, TOPIC_APPROVALS, BLOG_APPROVALS, BLOG_STATUSES,
  statusColors, priorityColors, approvalColors, topicApprovalColors, blogStatusColors, internalApprovalColors,
  TASK_COLUMN_WIDTHS, CONTENT_COLUMN_WIDTHS
} from '@/lib/constants'

// Shared components imported from @/components/

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { id } = useParams()
  const { data: client, mutate: mutateClient, error: clientErr } = useSWR(id ? `/api/clients/${id}` : null, swrFetcher)
  const { data: tasks, mutate: mutateTasks } = useSWR(id ? `/api/tasks?client_id=${id}` : null, swrFetcher)
  const { data: reports, mutate: mutateReports } = useSWR(id ? `/api/reports?client_id=${id}` : null, swrFetcher)
  const { data: content, mutate: mutateContent } = useSWR(id ? `/api/content?client_id=${id}` : null, swrFetcher)
  const { data: resources, mutate: mutateResources } = useSWR(id ? `/api/clients/${id}/resources` : null, swrFetcher)
  const { data: members } = useSWR('/api/team', swrFetcher)

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
  const addContentInputRef = useRef(null)

  useEffect(() => {
    const savedTasks = localStorage.getItem('client_tasks_col_order_v2')
    const parsedTasks = safeJSON(savedTasks)
    if (parsedTasks && Array.isArray(parsedTasks)) {
      setTaskColOrder(parsedTasks.filter(c => c !== 'client').includes('selection') ? parsedTasks.filter(c => c !== 'client') : ['selection', ...parsedTasks.filter(c => c !== 'selection' && c !== 'client')])
    } else {
      setTaskColOrder(['selection', 'title', 'category', 'status', 'priority', 'eta', 'assigned', 'link', 'internal_approval', 'send_link', 'client_approval', 'client_feedback', 'actions'])
    }

    // Always nuke the old v2 key so stale orders without blog_doc are gone
    localStorage.removeItem('client_content_col_order_v2')

    const savedContent = localStorage.getItem('client_content_col_order_v3')
    const parsedContent = safeJSON(savedContent)
    const defaultContentCols = ['selection', 'week', 'title', 'keyword', 'writer', 'topic_approval', 'blog_status', 'blog_doc', 'blog_internal_approval', 'send_link', 'blog_approval', 'blog_feedback', 'link', 'published', 'comments', 'actions']
    if (parsedContent && Array.isArray(parsedContent)) {
      let cols = parsedContent.filter(c => c !== 'client' && c !== 'outline')
      // Inject blog_doc before blog_internal_approval if not already present
      if (!cols.includes('blog_doc')) {
        const idx = cols.indexOf('blog_internal_approval')
        cols = idx >= 0 ? [...cols.slice(0, idx), 'blog_doc', ...cols.slice(idx)] : [...cols, 'blog_doc']
      }
      setContentColOrder(cols.includes('selection') ? cols : ['selection', ...cols.filter(c => c !== 'selection')])
    } else {
      setContentColOrder(defaultContentCols)
    }
  }, [])
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

  useEffect(() => {
    if (client) setSettingsForm(client)
  }, [client])

  const updateTask = async (taskId, field, value) => {
    const task = safeArray(tasks).find(t => t.id === taskId)
    if (!task) return

    setSaving(s => ({ ...s, [taskId]: true }))
    const currentTasks = tasks || []
    const updatedTasks = currentTasks.map(t => t.id === taskId ? { ...t, [field]: value } : t)
    mutateTasks(updatedTasks, false)

    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          [field]: value,
          updated_at: task.updated_at // Send for optimistic locking
        })
      })

      if (res.status === 409) {
        const error = await res.json()
        alert(error.error || 'Concurrency error: Task was modified by another user.')
        mutateTasks()
      } else if (res.ok) {
        const updatedTask = await res.json()
        mutateTasks(currentTasks.map(t => t.id === taskId ? updatedTask : t), false)
      }
    } catch (e) {
      console.error('Update failed', e)
    }

    mutateTasks()
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  const publishTask = async (taskId) => {
    const task = safeArray(tasks).find(t => t.id === taskId)
    setSaving(s => ({ ...s, [taskId]: true }))
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/publish`, {
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
          mutateTasks(safeArray(tasks).map(t => t.id === taskId ? data.task : t), false)
        }
      }
    } catch (e) {
      console.error('Publish failed', e)
    }
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  const publishContent = async (contentId) => {
    const item = safeArray(content).find(c => c?.id === contentId)
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
          mutateContent(safeArray(content).map(c => c.id === contentId ? data.content : c), false)
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
    const res = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ ...newTask, client_id: id }) })
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
        await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
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
          const res = await apiFetch('/api/tasks/bulk', {
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
    const { name, service_type, portal_password, npl_member_id, tpl_member_id, cpl_member_id } = settingsForm
    const payload = { name, service_type }
    if (portal_password) payload.portal_password = portal_password
    if (npl_member_id !== undefined) payload.npl_member_id = npl_member_id
    if (tpl_member_id !== undefined) payload.tpl_member_id = tpl_member_id
    if (cpl_member_id !== undefined) payload.cpl_member_id = cpl_member_id

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
    const currentContent = content || []
    const updatedContent = currentContent.map(c => c.id === contentId ? { ...c, [field]: value } : c)
    mutateContent(updatedContent, false)

    const res = await apiFetch(`/api/content/${contentId}`, { method: 'PUT', body: JSON.stringify({ [field]: value, updated_at: (currentContent.find(c => c.id === contentId))?.updated_at }) })
    if (res.status === 409) {
      alert('Concurrency error: Content has been modified by another user.')
      mutateContent()
    } else if (res.ok) {
      const updated = await res.json()
      mutateContent(updatedContent.map(c => c.id === contentId ? updated : c), false)
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

  const allTasks = useMemo(() => safeArray(tasks), [tasks])
  const allReports = useMemo(() => safeArray(reports), [reports])
  const allContent = useMemo(() => safeArray(content), [content])
  const allResources = useMemo(() => safeArray(resources), [resources])
  const allMembers = useMemo(() => safeArray(members), [members])

  const completedTasks = useMemo(() => allTasks.filter(t => t?.status === 'Completed').length, [allTasks])
  const progress = useMemo(() => allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0, [allTasks.length, completedTasks])
  const memberMap = useMemo(() => Object.fromEntries(allMembers.map(m => [m?.id, m?.name])), [allMembers])
  const approvalCount = useMemo(() => allTasks.filter(t => t?.client_approval === 'Approved').length, [allTasks])
  const changesCount = useMemo(() => allTasks.filter(t => t?.client_approval === 'Required Changes').length, [allTasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleTaskRowDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      const oldIndex = allTasks.findIndex((t) => t.id === active.id)
      const newIndex = allTasks.findIndex((t) => t.id === over.id)
      mutateTasks(arrayMove(allTasks, oldIndex, newIndex), false)
    }
  }

  const handleTaskColDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setTaskColOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const updated = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem('client_tasks_col_order_v2', JSON.stringify(updated))
        return updated
      })
    }
  }

  const handleContentRowDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      const oldIndex = allContent.findIndex((c) => c.id === active.id)
      const newIndex = allContent.findIndex((c) => c.id === over.id)
      mutateContent(arrayMove(allContent, oldIndex, newIndex), false)
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

  if (!client && !clientErr) return <div className="p-8 text-gray-400">Loading...</div>
  if (!client || clientErr) return <div className="p-8 text-gray-400">Client not found</div>

  // --- Sortable Components ---
  const SortableHeader = ({ id, label, sortField: sField, handleSort, type = 'task' }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'header' })
    const widths = type === 'task' ? TASK_COLUMN_WIDTHS : CONTENT_COLUMN_WIDTHS
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 20 : 0,
      width: widths[id] || 'auto',
      minWidth: widths[id] || 'auto'
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
          <span className="truncate" title={label}>{label}</span>
        </div>
      </th>
    )
  }

  const TaskSortableRow = ({ task }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task?.id || 'unknown' })
    if (!task?.id) return null
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 0 }
    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        {safeArray(taskColOrder).map(colId => (
          <td key={colId} className={`px-3 py-1.5 overflow-hidden ${colId === 'internal_approval' || colId === 'send_link' ? 'bg-gray-50/50' : ''}`} style={{ width: TASK_COLUMN_WIDTHS[colId], minWidth: TASK_COLUMN_WIDTHS[colId] }}>
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
            {colId === 'title' && (
              <div className="flex items-center gap-2">
                <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <GripVertical className="w-3 h-3" />
                </div>
                {saving[task.id] && <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
                <EditableCell value={task.title} onSave={v => updateTask(task.id, 'title', v)} />
              </div>
            )}
            {colId === 'category' && <EditableCell value={task.category} type="select" options={CATEGORIES} onSave={v => updateTask(task.id, 'category', v)} />}
            {colId === 'status' && <EditableCell value={task.status} type="status" options={STATUSES} onSave={v => updateTask(task.id, 'status', v)} />}
            {colId === 'priority' && <EditableCell value={task.priority} type="priority" options={PRIORITIES} onSave={v => updateTask(task.id, 'priority', v)} />}
            {colId === 'eta' && <EditableCell value={task.eta_end} type="date" onSave={v => updateTask(task.id, 'eta_end', v)} />}
            {colId === 'assigned' && (
              <EditableCell
                value={memberMap[task.assigned_to] || ''}
                type="select"
                options={allMembers.map(m => m.name)}
                onSave={v => {
                  const member = allMembers.find(m => m.name === v)
                  updateTask(task.id, 'assigned_to', member?.id || null)
                }}
              />
            )}
            {colId === 'link' && <LinkCell value={task.link_url} onSave={v => updateTask(task.id, 'link_url', v)} />}
            {colId === 'internal_approval' && (
              <EditableCell
                value={task.internal_approval || 'Pending'}
                type="internal_approval"
                options={INTERNAL_APPROVALS}
                disabled={task.status !== 'Completed'}
                onSave={v => updateTask(task.id, 'internal_approval', v)}
              />
            )}
            {colId === 'send_link' && (
              <Button
                size="sm"
                variant={task.client_link_visible ? "ghost" : "default"}
                className={`h-7 px-2 text-[10px] uppercase tracking-wider font-bold ${task.client_link_visible ? 'text-green-600' : ''}`}
                disabled={
                  task.status !== 'Completed' ||
                  task.internal_approval !== 'Approved' ||
                  !task.link_url ||
                  task.client_link_visible === true
                }
                onClick={() => publishTask(task.id)}
              >
                {task.client_link_visible ? 'Sent' : 'Send Link'}
              </Button>
            )}
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
            {colId === 'actions' && (
              <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </td>
        ))}
      </tr>
    )
  }

  const ContentSortableRow = ({ item }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item?.id || 'unknown' })
    if (!item?.id) return null
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 0 }
    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        {safeArray(contentColOrder).map(colId => (
          <td key={colId} className="px-3 py-1.5 overflow-hidden" style={{ width: CONTENT_COLUMN_WIDTHS[colId], minWidth: CONTENT_COLUMN_WIDTHS[colId] }}>
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
                <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <GripVertical className="w-3 h-3" />
                </div>
                <EditableCell value={item.week} onSave={v => updateContent(item.id, 'week', v)} placeholder="W1" />
              </div>
            )}
            {colId === 'title' && <EditableCell value={item.blog_title} onSave={v => updateContent(item.id, 'blog_title', v)} />}
            {colId === 'keyword' && <EditableCell value={item.primary_keyword} onSave={v => updateContent(item.id, 'primary_keyword', v)} placeholder="keyword" />}
            {colId === 'writer' && <EditableCell value={item.writer} onSave={v => updateContent(item.id, 'writer', v)} placeholder="Writer" />}
            {colId === 'outline' && <EditableCell value={item.outline_status} type="select" options={OUTLINE_STATUSES} onSave={v => updateContent(item.id, 'outline_status', v)} />}
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
            {colId === 'comments' && <EditableCell value={item.comments} onSave={v => updateContent(item.id, 'comments', v)} placeholder="Notes..." />}
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

  const taskColLabels = {
    selection: '',
    title: 'Task', category: 'Category', status: 'Status', priority: 'Priority',
    eta: 'ETA End', assigned: 'Assigned', link: 'Link', internal_approval: 'Internal Approval',
    send_link: 'Send Link', client_approval: 'Client Approval', client_feedback: 'Feedback', actions: ''
  }

  const contentColLabels = {
    selection: '',
    week: 'Week', title: 'Blog Title', keyword: 'Keyword', writer: 'Writer',
    outline: 'Outline Status', topic_approval: 'Topic Approval', blog_status: 'Blog Status',
    blog_doc: 'Blog Doc', blog_internal_approval: 'Internal Approval', send_link: 'Send Link',
    blog_approval: 'Client Approval', blog_feedback: 'Feedback',
    link: 'Live Link', published: 'Published', comments: 'Notes', actions: ''
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

      {/* Progress + Approval summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Overall Progress</span>
            <span className="text-sm text-gray-500">{completedTasks}/{allTasks.length} completed</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-right mt-1 text-xs text-gray-400">{progress}%</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4 items-center">
          <div className="text-center flex-1">
            <div className="text-2xl font-bold text-green-600">{approvalCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">Approved</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-2xl font-bold text-red-500">{changesCount}</div>
            <div className="text-xs text-gray-400 mt-0.5">Changes Req.</div>
          </div>
          <div className="text-center flex-1">
            <div className="text-2xl font-bold text-gray-400">{allTasks.filter(t => !t?.client_approval || t?.client_approval === 'Pending Review').length}</div>
            <div className="text-xs text-gray-400 mt-0.5">Pending</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList className="mb-4">
          <TabsTrigger value="timeline">Timeline Tracker</TabsTrigger>
          <TabsTrigger value="content" className="gap-1">
            <FileText className="w-3.5 h-3.5" /> Content Calendar {allContent.length > 0 && `(${allContent.length})`}
          </TabsTrigger>
          <TabsTrigger value="resources" className="gap-1">
            <Library className="w-3.5 h-3.5" /> Resources {allResources.length > 0 && `(${allResources.length})`}
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> Reports {allReports.length > 0 && `(${allReports.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ── Timeline Tab ───────────────────────────────────────────────── */}
        <TabsContent value="timeline">
          <div className="flex items-center justify-between mb-4 h-9">
            <div className="flex items-center gap-3">
              {selectedTasks.size > 0 && (
                <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                  <span className="text-xs font-medium text-red-700">{selectedTasks.size} selected</span>
                  <div className="w-px h-3 bg-red-200" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-100 text-xs gap-1.5 font-bold"
                    onClick={deleteSelectedTasks}
                    disabled={bulkDeleting}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete Selected
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskColDragEnd} modifiers={[restrictToHorizontalAxis]}>
              <table className="w-full text-sm" style={{ minWidth: '1800px', tableLayout: 'fixed' }}>
                <thead>
                  <SortableContext items={taskColOrder} strategy={horizontalListSortingStrategy}>
                    <tr className="border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
                      {safeArray(taskColOrder).map(colId => (
                        <SortableHeader key={colId} id={colId} label={taskColLabels[colId]} type="task" />
                      ))}
                    </tr>
                  </SortableContext>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allTasks.length === 0 ? (
                    <tr>
                      <td colSpan={taskColOrder.length} className="px-4 py-16 text-center text-gray-400">
                        No tasks yet. Add your first task below.
                      </td>
                    </tr>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskRowDragEnd} modifiers={[restrictToVerticalAxis]}>
                      <SortableContext items={allTasks.map(t => t?.id)} strategy={verticalListSortingStrategy}>
                        {allTasks.map(task => <TaskSortableRow key={task?.id} task={task} />)}
                      </SortableContext>
                    </DndContext>
                  )}
                  {/* Add row */}
                  <tr className="bg-gray-50/30 border-t border-dashed border-gray-200">
                    <td className="px-2 py-2"></td>
                    <td className="px-3 py-2" colSpan={2}>
                      <input
                        type="text" value={newTask.title}
                        onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addTask()}
                        placeholder="+ Add a task..."
                        className="w-full text-xs px-2 py-1 bg-transparent border border-dashed border-gray-300 rounded focus:outline-none focus:border-blue-400 focus:bg-white"
                        disabled={addingTask}
                      />
                    </td>
                    <td colSpan={taskColOrder.length - 3} className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={addTask} disabled={addingTask || !newTask.title.trim()} className="text-xs h-7">
                        <Plus className="w-3 h-3 mr-1" />{addingTask ? 'Adding...' : 'Add'}
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </DndContext>
          </div>
        </TabsContent>

        {/* ── Content Calendar Tab ─────────────────────────────────────────── */}
        <TabsContent value="content">
          <div className="flex items-center justify-between mb-4 h-9">
            <div className="flex items-center gap-3">
              {selectedContent.size > 0 && (
                <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                  <span className="text-xs font-medium text-red-700">{selectedContent.size} selected</span>
                  <div className="w-px h-3 bg-red-200" />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-red-600 hover:text-red-700 hover:bg-red-100 text-xs gap-1.5 font-bold"
                    onClick={deleteSelectedContent}
                    disabled={bulkDeletingContent}
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete Selected
                  </Button>
                </div>
              )}
            </div>
            <Button
              size="sm"
              className="gap-1.5 h-8"
              onClick={() => { addContentInputRef.current?.focus(); addContentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
            >
              <Plus className="w-4 h-4" /> Add Content
            </Button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleContentColDragEnd} modifiers={[restrictToHorizontalAxis]}>
              <table className="w-full text-sm" style={{ minWidth: '2000px', tableLayout: 'fixed' }}>
                <thead>
                  <SortableContext items={contentColOrder} strategy={horizontalListSortingStrategy}>
                    <tr className="border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
                      {safeArray(contentColOrder).map(colId => (
                        <SortableHeader key={colId} id={colId} label={contentColLabels[colId]} type="content" />
                      ))}
                    </tr>
                  </SortableContext>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allContent.length === 0 ? (
                    <tr>
                      <td colSpan={contentColOrder.length} className="px-4 py-16 text-center text-gray-400">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                        No content calendar items yet. Add your first blog post below.
                      </td>
                    </tr>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleContentRowDragEnd} modifiers={[restrictToVerticalAxis]}>
                      <SortableContext items={allContent.map(i => i?.id)} strategy={verticalListSortingStrategy}>
                        {allContent.map(item => <ContentSortableRow key={item?.id} item={item} />)}
                      </SortableContext>
                    </DndContext>
                  )}
                  {/* Add row */}
                  <tr className="bg-gray-50/30 border-t border-dashed border-gray-200">
                    <td className="px-2 py-2"></td>
                    <td className="px-3 py-2" colSpan={2}>
                      <input
                        ref={addContentInputRef}
                        type="text" value={newContent.blog_title}
                        onChange={e => setNewContent(n => ({ ...n, blog_title: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addContent()}
                        placeholder="+ Add a blog post..."
                        className="w-full text-xs px-2 py-1 bg-transparent border border-dashed border-gray-300 rounded focus:outline-none focus:border-blue-400 focus:bg-white"
                        disabled={addingContent}
                      />
                    </td>
                    <td colSpan={contentColOrder.length - 3} className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={addContent} disabled={addingContent || !newContent.blog_title.trim()} className="text-xs h-7">
                        <Plus className="w-3 h-3 mr-1" />{addingContent ? 'Adding...' : 'Add'}
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </DndContext>
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
            {settingsError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{settingsError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  )
}
