'use client'

import { useEffect, useState, useRef, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/middleware/auth'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2, RefreshCw, GripVertical, GripHorizontal, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { safeJSON, safeArray } from '@/lib/safe'
import { EditableCell } from '@/components/table/EditableCell'
import { LinkCell } from '@/components/table/LinkCell'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Pagination } from '@/components/shared/Pagination'
import { ClientSwitcher } from '@/components/shared/ClientSwitcher'
import { STATUSES, CATEGORIES, PRIORITIES, APPROVALS, INTERNAL_APPROVALS, statusColors, priorityColors, approvalColors, internalApprovalColors, TASK_COLUMN_WIDTHS, EMAIL_COLUMN_WIDTHS, PAID_COLUMN_WIDTHS } from '@/lib/constants'
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


function TasksPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 })
  const [saving, setSaving] = useState({})
  const [selected, setSelected] = useState([])
  const [bulkAction, setBulkAction] = useState('__none__')
  const [newTask, setNewTask] = useState({ title: '', client_id: '' })
  const [addingTask, setAddingTask] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState(null)

  // Sync state with URL
  const filterClient = searchParams.get('client_id') || 'all'
  const filterStatus = searchParams.get('status') || 'all'
  const filterCategory = searchParams.get('category') || 'all'
  const filterAssignee = searchParams.get('assigned_to') || 'all'
  const filterPriority = searchParams.get('priority') || 'all'
  const filterSearch = searchParams.get('search') || ''
  const service = searchParams.get('service') || 'seo'
  const page = parseInt(searchParams.get('page')) || 1

  const [localSearch, setLocalSearch] = useState(filterSearch)
  const [columnOrder, setColumnOrder] = useState([])

  const getServiceConfig = (srv) => {
    switch (srv) {
      case 'email':
        return {
          endpoint: '/api/email-tasks',
          label: 'Email Tasks',
          columns: ['serial', 'selection', 'client', 'title', 'status', 'assigned', 'link', 'internal_approval', 'send_link', 'campaign_live', 'live_data', 'client_approval', 'client_feedback', 'actions'],
          widths: EMAIL_COLUMN_WIDTHS
        }
      case 'paid':
        return {
          endpoint: '/api/paid-tasks',
          label: 'Paid Ads Tasks',
          columns: ['serial', 'selection', 'client', 'title', 'status', 'assigned', 'link', 'internal_approval', 'send_link', 'client_approval', 'client_feedback', 'actions'],
          widths: PAID_COLUMN_WIDTHS
        }
      default:
        return {
          endpoint: '/api/tasks',
          label: 'SEO Tasks',
          columns: ['serial', 'selection', 'client', 'title', 'category', 'status', 'priority', 'eta', 'assigned', 'link', 'internal_approval', 'send_link', 'client_approval', 'client_feedback', 'actions'],
          widths: TASK_COLUMN_WIDTHS
        }
    }
  }

  const serviceConfig = useMemo(() => getServiceConfig(service), [service])

  const updateQueryParams = (updates) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value === 'all' || value === '') params.delete(key)
      else params.set(key, value)
    })
    if (!updates.page && page !== 1) params.delete('page')
    router.push(`/dashboard/tasks?${params.toString()}`)
  }

  useEffect(() => {
    const saved = localStorage.getItem(`tasks_column_order_${service}`)
    const parsed = safeJSON(saved)
    if (parsed && Array.isArray(parsed)) {
      const currentCols = serviceConfig.columns
      const merged = parsed.filter(id => currentCols.includes(id))
      currentCols.forEach(id => {
        if (!merged.includes(id)) merged.push(id)
      })
      setColumnOrder(merged)
    } else {
      setColumnOrder(serviceConfig.columns)
    }
  }, [service, serviceConfig.columns])

  const loadData = async () => {
    setLoading(true)
    setTasks([]) // Clear stale data immediate
    setPagination({ total: 0, page: 1, totalPages: 1 })

    const params = new URLSearchParams(searchParams.toString())
    params.delete('service') // API doesn't need the service param, it's in the URL
    if (!params.get('limit')) params.set('limit', '50')

    const [tasksRes, clientsRes, membersRes] = await Promise.all([
      apiFetch(`${serviceConfig.endpoint}?${params.toString()}`),
      apiFetch('/api/clients?lite=1'),
      apiFetch('/api/team'),
    ])
    const [tasksData, clientsData, membersData] = await Promise.all([
      tasksRes.json(), clientsRes.json(), membersRes.json(),
    ])

    setTasks(safeArray(tasksData.data))
    setPagination({
      total: tasksData.total || 0,
      page: tasksData.page || 1,
      totalPages: tasksData.totalPages || 1
    })
    setClients(safeArray(clientsData))
    setMembers(safeArray(membersData))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [searchParams, serviceConfig.endpoint])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filterSearch) {
        updateQueryParams({ search: localSearch })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localSearch])

  const updateTask = async (taskId, field, value) => {
    const task = safeArray(tasks).find(t => t?.id === taskId)
    if (!task) return

    setSaving(s => ({ ...s, [taskId]: true }))
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, [field]: value } : t))

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
        loadData()
      } else if (res.ok) {
        const updatedTask = await res.json()
        setTasks(ts => ts.map(t => t.id === taskId ? updatedTask : t))
      }
    } catch (e) {
      console.error('Update failed', e)
    }

    setSaving(s => ({ ...s, [taskId]: false }))
  }

  const publishTask = async (taskId) => {
    const task = safeArray(tasks).find(t => t.id === taskId)
    setSaving(s => ({ ...s, [taskId]: true }))
    try {
      const res = await apiFetch(`${serviceConfig.endpoint}/${taskId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ updated_at: task?.updated_at })
      })
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Publish failed')
        loadData()
      } else {
        const data = await res.json()
        if (data.task) {
          setTasks(ts => ts.map(t => t.id === taskId ? data.task : t))
        }
      }
    } catch (e) {
      console.error('Publish failed', e)
    }
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  const deleteTask = (taskId) => {
    setConfirmConfig({
      title: 'Delete Task',
      description: 'This will permanently delete the task. This cannot be undone.',
      onConfirm: async () => {
        await apiFetch(`${serviceConfig.endpoint}/${taskId}`, { method: 'DELETE' })
        setTasks(ts => ts.filter(t => t.id !== taskId))
      }
    })
  }

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handleBulkAction = async () => {
    if (!bulkAction || bulkAction === '__none__' || selected.length === 0) return
    const [field, value] = bulkAction.split(':')
    // NOTE: Bulk update endpoint might need to be service-specific if it changes, 
    // but for now, we'll assume a shared /bulk-update if possible or specific ones.
    // For safety, let's use service-specific ones if we decide to implement them.
    const bulkUrl = service === 'seo' ? '/api/tasks/bulk-update' : `${serviceConfig.endpoint}/bulk-update`
    await apiFetch(bulkUrl, {
      method: 'POST',
      body: JSON.stringify({ task_ids: selected, updates: { [field]: value } }),
    })
    setSelected([])
    setBulkAction('__none__')
    loadData()
  }

  const addTask = async () => {
    if (!newTask.title.trim() || !newTask.client_id) return
    setAddingTask(true)
    const res = await apiFetch(serviceConfig.endpoint, { method: 'POST', body: JSON.stringify(newTask) })
    const task = await res.json()
    setTasks(ts => [task, ...ts])
    setNewTask(n => ({ ...n, title: '' }))
    setAddingTask(false)
  }

  const allTasks = useMemo(() => safeArray(tasks), [tasks])
  const memberMap = useMemo(() => Object.fromEntries(safeArray(members).map(m => [m?.id, m?.name])), [members])
  const anyFilter = useMemo(() => filterClient !== 'all' || filterStatus !== 'all' || filterCategory !== 'all' || filterAssignee !== 'all' || filterPriority !== 'all' || filterSearch.trim() !== '', [filterClient, filterStatus, filterCategory, filterAssignee, filterPriority, filterSearch])

  const sorted = allTasks

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleRowDragEnd = async (event) => {
    const { active, over } = event
    if (!over) return
    if (active.id !== over.id) {
      const oldIndex = allTasks.findIndex((t) => t.id === active.id)
      const newIndex = allTasks.findIndex((t) => t.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const updated = arrayMove(allTasks, oldIndex, newIndex)
      setTasks(updated)

      try {
        await apiFetch(`${serviceConfig.endpoint}/reorder`, {
          method: 'PUT',
          body: JSON.stringify({ ids: updated.map(t => t.id) })
        })
      } catch (e) {
        console.error('Failed to persist task order', e)
        loadData()
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
        localStorage.setItem(`tasks_column_order_${service}`, JSON.stringify(updated))
        return updated
      })
    }
  }

  const SortableHeader = ({ id, label, sortField: sField }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'header' })
    const isSticky = id === 'title' || id === 'serial' || id === 'selection' || id === 'client'
    const leftPosMap = { serial: '0px', selection: '55px', client: '115px', title: '255px' }
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 40 : (isSticky ? 30 : 10),
      width: serviceConfig.widths[id] || 'auto',
      minWidth: serviceConfig.widths[id] || 'auto',
      position: isSticky ? 'sticky' : 'relative',
      left: isSticky ? leftPosMap[id] : undefined,
      background: isSticky ? '#f9fafb' : undefined,
      boxShadow: id === 'title' ? '4px 0 8px -4px rgba(0,0,0,0.1)' : undefined,
      borderRight: isSticky ? '1px solid #e5e7eb' : undefined
    }
    return (
      <th ref={setNodeRef} style={style} className={`text-left px-3 py-2.5 font-semibold text-gray-600 bg-gray-50 border-r border-gray-100 last:border-0 ${isDragging ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div {...attributes} {...listeners} className="cursor-grab hover:text-blue-500 flex-shrink-0">
            <GripHorizontal className="w-3 h-3" />
          </div>
          <span className={`truncate ${sField ? 'cursor-pointer hover:text-gray-900' : ''}`} title={label}>
            {label}
          </span>
        </div>
      </th>
    )
  }

  const SortableRow = ({ task }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task?.id || 'unknown' })
    if (!task?.id) return null
    const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 0 }

    return (
      <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 group border-b border-gray-100 ${selected.includes(task?.id) ? 'bg-blue-50' : ''} ${isDragging ? 'opacity-50 shadow-lg' : ''}`}>
        {safeArray(columnOrder).map(colId => {
          const isSticky = colId === 'title' || colId === 'serial' || colId === 'selection' || colId === 'client'
          const leftPosMap = { serial: '0px', selection: '55px', client: '115px', title: '255px' }
          const stickyStyle = isSticky ? {
            position: 'sticky',
            left: leftPosMap[colId],
            background: selected.includes(task?.id) ? '#eff6ff' : '#fff',
            zIndex: 20,
            borderRight: '1px solid #f3f4f6',
            boxShadow: colId === 'title' ? '4px 0 8px -4px rgba(0,0,0,0.1)' : ''
          } : {}
          return (
            <td key={colId} className={`px-3 py-1.5 overflow-hidden ${!isSticky && (colId === 'internal_approval' || colId === 'send_link') ? 'bg-gray-50/50' : ''}`}
              style={{ width: serviceConfig.widths[colId], minWidth: serviceConfig.widths[colId], ...stickyStyle }}>
              {colId === 'serial' && (
                <div className="text-[10px] font-mono text-gray-400 text-center select-none">
                  {allTasks.findIndex(t => t.id === task.id) + 1}
                </div>
              )}
              {colId === 'selection' && (
                <div className="flex items-center gap-3 px-1">
                  <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="w-3 h-3" />
                  </div>
                  <Checkbox checked={selected.includes(task.id)} onCheckedChange={() => toggleSelect(task.id)} />
                </div>
              )}
              {colId === 'client' && (
                <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded whitespace-nowrap">
                  {clients.find(c => c.id === task.client_id)?.name || task.client_name || '?'}
                </span>
              )}
              {colId === 'title' && <EditableCell value={task.title} onSave={v => updateTask(task.id, 'title', v)} />}
              {colId === 'category' && <EditableCell value={task.category} type="select" options={CATEGORIES} onSave={v => updateTask(task.id, 'category', v)} />}
              {colId === 'status' && <EditableCell value={task.status} type="status" options={STATUSES} onSave={v => updateTask(task.id, 'status', v)} />}
              {colId === 'priority' && <EditableCell value={task.priority} type="priority" options={PRIORITIES} onSave={v => updateTask(task.id, 'priority', v)} />}
              {colId === 'eta' && <EditableCell value={task.eta_end} type="date" onSave={v => updateTask(task.id, 'eta_end', v)} />}
              {colId === 'assigned' && (
                <EditableCell
                  value={memberMap[task.assigned_to] || ''}
                  type="select"
                  options={members.map(m => m.name)}
                  onSave={v => {
                    const member = members.find(m => m.name === v)
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
              {colId === 'campaign_live' && <EditableCell value={task.campaign_live_date} type="date" onSave={v => updateTask(task.id, 'campaign_live_date', v)} />}
              {colId === 'live_data' && <EditableCell value={task.live_data} type="date" onSave={v => updateTask(task.id, 'live_data', v)} />}
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
                <button onClick={() => deleteTask(task?.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </td>
          );
        })}
      </tr>
    )
  }

  const columnLabels = {
    selection: '', client: 'Client', title: 'Task', category: 'Category', status: 'Status', priority: 'Priority',
    eta: 'ETA End', assigned: 'Assigned', link: 'Link', internal_approval: 'Internal Approval', send_link: 'Send Link',
    campaign_live: 'Campaign Live', live_data: 'Live Data',
    client_approval: 'Client Approval', client_feedback: 'Client Feedback', actions: ''
  }
  const columnSortFields = { client: 'client_name', title: 'title', status: 'status', priority: 'priority', eta: 'eta_end', campaign_live: 'campaign_live_date' }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Tasks</h1>
          <p className="text-gray-500 text-sm mt-1">{pagination.total} {serviceConfig.label} across all clients</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/50 shadow-inner">
            <button
              onClick={() => updateQueryParams({ service: 'seo', page: 1 })}
              className={`px-6 py-2 text-xs font-bold rounded-lg transition-all ${service === 'seo' ? 'bg-white text-blue-700 shadow-md border border-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
            >
              SEO Tasks
            </button>
            <button
              onClick={() => updateQueryParams({ service: 'email', page: 1 })}
              className={`px-6 py-2 text-xs font-bold rounded-lg transition-all ${service === 'email' ? 'bg-white text-blue-700 shadow-md border border-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
            >
              Email Tasks
            </button>
            <button
              onClick={() => updateQueryParams({ service: 'paid', page: 1 })}
              className={`px-6 py-2 text-xs font-bold rounded-lg transition-all ${service === 'paid' ? 'bg-white text-blue-700 shadow-md border border-blue-50' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
            >
              Paid Ads Tasks
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="h-10 px-4 gap-2 border-gray-200 hover:bg-gray-50 hover:text-blue-600 transition-all shadow-sm font-semibold">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
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
            <Plus className="w-3.5 h-3.5" /> Quick Add {serviceConfig.label.slice(0, -1)}
          </h3>
          <div className="flex gap-2">
            <Select
              value={newTask.client_id || '__none__'}
              onValueChange={v => setNewTask(n => ({ ...n, client_id: v === '__none__' ? '' : v }))}
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
                type="text" value={newTask.title}
                onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder={`What ${serviceConfig.label.toLowerCase()} needs to be done?`}
                className="w-full h-9 text-xs px-3 py-1 bg-white border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-all"
                disabled={addingTask}
              />
            </div>
            <Button
              onClick={addTask}
              disabled={addingTask || !newTask.title.trim() || !newTask.client_id || newTask.client_id === '__none__'}
              className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
            >
              {addingTask ? 'Saving...' : 'Add Task'}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-white border border-gray-200 rounded-lg">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          <Input
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
            placeholder="Search within tasks..."
            className="h-8 text-xs pl-8 w-60 border-gray-200"
          />
        </div>

        <Select value={filterStatus} onValueChange={v => updateQueryParams({ status: v })}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s === 'Pending Review' ? 'Review' : s}</SelectItem>)}
          </SelectContent>
        </Select>
        {service === 'seo' && (
          <Select value={filterCategory} onValueChange={v => updateQueryParams({ category: v })}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterAssignee} onValueChange={v => updateQueryParams({ assigned_to: v })}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Members" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Members</SelectItem>
            {safeArray(members).map(m => <SelectItem key={m?.id} value={m?.id} className="text-xs">{m?.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {service === 'seo' && (
          <Select value={filterPriority} onValueChange={v => updateQueryParams({ priority: v })}>
            <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="All Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Priority</SelectItem>
              {PRIORITIES.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {anyFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-400" onClick={() => {
            updateQueryParams({
              client_id: 'all', status: 'all', category: 'all',
              assigned_to: 'all', priority: 'all', search: ''
            })
            setLocalSearch('')
          }}>Clear filters</Button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm text-blue-700 font-medium">{selected.length} selected</span>
          <Select value={bulkAction} onValueChange={setBulkAction}>
            <SelectTrigger className="h-7 text-xs w-48 bg-white"><SelectValue placeholder="Bulk action..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs text-gray-400">Choose action…</SelectItem>
              <SelectItem value="status:In Progress" className="text-xs">Set: In Progress</SelectItem>
              <SelectItem value="status:Completed" className="text-xs">Set: Completed</SelectItem>
              <SelectItem value="status:Blocked" className="text-xs">Set: Blocked</SelectItem>
              <SelectItem value="status:Pending Review" className="text-xs">Set: Review</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-7 text-xs" onClick={handleBulkAction} disabled={bulkAction === '__none__'}>Apply</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd} modifiers={[restrictToHorizontalAxis]}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd} modifiers={[restrictToVerticalAxis]}>
            <table className="w-full text-sm" style={{ minWidth: '1800px', tableLayout: 'fixed' }}>
              <thead>
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    {columnOrder.map(colId => (
                      <SortableHeader key={colId} id={colId} label={columnLabels[colId]} sortField={columnSortFields[colId]} />
                    ))}
                  </tr>
                </SortableContext>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr><td colSpan={columnOrder.length} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={columnOrder.length} className="px-4 py-8 text-center text-gray-400">No tasks found</td></tr>
                ) : (
                  <SortableContext items={sorted.map(t => t?.id)} strategy={verticalListSortingStrategy}>
                    {sorted.map(task => <SortableRow key={task.id} task={task} />)}
                  </SortableContext>
                )}

              </tbody>
            </table>
          </DndContext>
        </DndContext>
        <Pagination
          total={pagination.total}
          page={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={(p) => updateQueryParams({ page: p })}
        />
      </div>
      <ConfirmDialog config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  )
}

export default function AllTasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading Dashboard...</div>}>
      <TasksPageContent />
    </Suspense>
  )
}
