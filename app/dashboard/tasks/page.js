'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { apiFetch } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Trash2, RefreshCw, Link2, GripVertical, GripHorizontal } from 'lucide-react'
import { safeJSON, safeArray } from '@/lib/safe'
import { EditableCell } from '@/components/EditableCell'
import { LinkCell } from '@/components/LinkCell'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { STATUSES, CATEGORIES, PRIORITIES, APPROVALS, INTERNAL_APPROVALS, statusColors, priorityColors, approvalColors, internalApprovalColors, TASK_COLUMN_WIDTHS } from '@/lib/constants'
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
import { restrictToFirstScrollableAncestor, restrictToHorizontalAxis, restrictToVerticalAxis } from '@dnd-kit/modifiers'


export default function AllTasksPage() {
  const [tasks, setTasks] = useState([])
  const [clients, setClients] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [selected, setSelected] = useState([])
  const [bulkAction, setBulkAction] = useState('__none__')
  const [newTask, setNewTask] = useState({ title: '', client_id: '' })
  const [addingTask, setAddingTask] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState(null)

  // Filters – use sentinel 'all' so SelectItem never gets value=""
  const [filterClient, setFilterClient] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterAssignee, setFilterAssignee] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortField, setSortField] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')

  const [columnOrder, setColumnOrder] = useState([])

  useEffect(() => {
    const saved = localStorage.getItem('tasks_column_order')
    const parsed = safeJSON(saved)
    if (parsed) setColumnOrder(parsed)
    else setColumnOrder(['selection', 'client', 'title', 'category', 'status', 'priority', 'eta', 'assigned', 'link', 'internal_approval', 'send_link', 'client_approval', 'client_feedback', 'actions'])
  }, [])

  const saveColumnOrder = (newOrder) => {
    setColumnOrder(newOrder)
    localStorage.setItem('tasks_column_order', JSON.stringify(newOrder))
  }

  const loadData = async () => {
    const params = new URLSearchParams()
    if (filterClient !== 'all') params.set('client_id', filterClient)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (filterCategory !== 'all') params.set('category', filterCategory)
    if (filterAssignee !== 'all') params.set('assigned_to', filterAssignee)
    if (filterPriority !== 'all') params.set('priority', filterPriority)

    const [tasksRes, clientsRes, membersRes] = await Promise.all([
      apiFetch(`/api/tasks?${params.toString()}`),
      apiFetch('/api/clients'),
      apiFetch('/api/team'),
    ])
    const [tasksData, clientsData, membersData] = await Promise.all([
      tasksRes.json(), clientsRes.json(), membersRes.json(),
    ])
    setTasks(safeArray(tasksData))
    setClients(safeArray(clientsData))
    setMembers(safeArray(membersData))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [filterClient, filterStatus, filterCategory, filterAssignee, filterPriority])

  const updateTask = async (taskId, field, value) => {
    const task = safeArray(tasks).find(t => t?.id === taskId)
    if (!task) return

    setSaving(s => ({ ...s, [taskId]: true }))
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, [field]: value } : t))

    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, {
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
      const res = await apiFetch(`/api/tasks/${taskId}/publish`, {
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
        await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
        setTasks(ts => ts.filter(t => t.id !== taskId))
      }
    })
  }

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const handleBulkAction = async () => {
    if (!bulkAction || bulkAction === '__none__' || selected.length === 0) return
    const [field, value] = bulkAction.split(':')
    await apiFetch('/api/tasks/bulk-update', {
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
    const res = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(newTask) })
    const task = await res.json()
    setTasks(ts => [task, ...ts])
    setNewTask(n => ({ ...n, title: '' }))
    setAddingTask(false)
  }

  const allTasks = useMemo(() => safeArray(tasks), [tasks])
  const memberMap = useMemo(() => Object.fromEntries(safeArray(members).map(m => [m?.id, m?.name])), [members])
  const anyFilter = useMemo(() => filterClient !== 'all' || filterStatus !== 'all' || filterCategory !== 'all' || filterAssignee !== 'all' || filterPriority !== 'all', [filterClient, filterStatus, filterCategory, filterAssignee, filterPriority])

  const sorted = useMemo(() => {
    if (!sortField) return allTasks
    return [...allTasks].sort((a, b) => {
      const va = a?.[sortField] || ''
      const vb = b?.[sortField] || ''
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [allTasks, sortField, sortDir])

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  const SortIcon = ({ field }) => (
    <span className="ml-1 text-gray-400">{sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}</span>
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleRowDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setSortField(null)
      setTasks((items) => {
        const oldIndex = items.findIndex((t) => t.id === active.id)
        const newIndex = items.findIndex((t) => t.id === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  const handleColDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id)
        const newIndex = items.indexOf(over.id)
        const updated = arrayMove(items, oldIndex, newIndex)
        localStorage.setItem('tasks_column_order', JSON.stringify(updated))
        return updated
      })
    }
  }

  // --- Column and Row Components ---
  const SortableHeader = ({ id, label, sortField: sField }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: id || 'header' })
    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 20 : 0,
      width: TASK_COLUMN_WIDTHS[id] || 'auto',
      minWidth: TASK_COLUMN_WIDTHS[id] || 'auto'
    }
    return (
      <th ref={setNodeRef} style={style} className={`text-left px-3 py-2.5 font-semibold text-gray-600 bg-gray-50 border-r border-gray-100 last:border-0 ${isDragging ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div {...attributes} {...listeners} className="cursor-grab hover:text-blue-500 flex-shrink-0">
            <GripHorizontal className="w-3 h-3" />
          </div>
          <span className={`truncate ${sField ? 'cursor-pointer hover:text-gray-900' : ''}`} onClick={() => sField && handleSort(sField)} title={label}>
            {label} {sField && <SortIcon field={sField} />}
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
        {safeArray(columnOrder).map(colId => (
          <td key={colId} className={`px-3 py-1.5 overflow-hidden ${colId === 'internal_approval' || colId === 'send_link' ? 'bg-gray-50/50' : ''}`} style={{ width: TASK_COLUMN_WIDTHS[colId], minWidth: TASK_COLUMN_WIDTHS[colId] }}>
            {colId === 'selection' && (
              <div className="flex items-center gap-3 px-1">
                <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3 h-3" />
                </div>
                <Checkbox checked={selected.includes(task.id)} onCheckedChange={() => toggleSelect(task.id)} />
              </div>
            )}
            {colId === 'client' && <span className="text-xs font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{task.client_name || '?'}</span>}
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
        ))}
      </tr>
    )
  }

  const columnLabels = {
    selection: '', client: 'Client', title: 'Task', category: 'Category', status: 'Status', priority: 'Priority',
    eta: 'ETA End', assigned: 'Assigned', link: 'Link', internal_approval: 'Internal Approval', send_link: 'Send Link',
    client_approval: 'Client Approval', client_feedback: 'Client Feedback', actions: ''
  }
  const columnSortFields = { client: 'client_name', title: 'title', status: 'status', priority: 'priority', eta: 'eta_end' }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Tasks</h1>
          <p className="text-gray-500 text-sm mt-1">{tasks.length} tasks across all clients</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Filters omitted for brevity, same as before */}
      <div className="flex flex-wrap gap-2 mb-4 p-3 bg-white border border-gray-200 rounded-lg">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Clients</SelectItem>
            {safeArray(clients).map(c => <SelectItem key={c?.id} value={c?.id} className="text-xs">{c?.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="text-xs">{s === 'Pending Review' ? 'Review' : s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All Members" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Members</SelectItem>
            {safeArray(members).map(m => <SelectItem key={m?.id} value={m?.id} className="text-xs">{m?.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="All Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Priority</SelectItem>
            {PRIORITIES.map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {anyFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-400" onClick={() => {
            setFilterClient('all'); setFilterStatus('all'); setFilterCategory('all')
            setFilterAssignee('all'); setFilterPriority('all')
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

      {/* Main Table with DnD */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-auto shadow-sm">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd} modifiers={[restrictToHorizontalAxis]}>
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
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd} modifiers={[restrictToVerticalAxis]}>
                  <SortableContext items={sorted.map(t => t?.id)} strategy={verticalListSortingStrategy}>
                    {sorted.map(task => <SortableRow key={task?.id} task={task} />)}
                  </SortableContext>
                </DndContext>
              )}

              {/* Quick Add Row - spans across the whole current column order */}
              <tr className="bg-gray-50/30 border-t border-dashed border-gray-200">
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2" colSpan={2}>
                  <Select value={newTask.client_id || '__none__'} onValueChange={v => setNewTask(n => ({ ...n, client_id: v === '__none__' ? '' : v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs text-gray-400">Select client…</SelectItem>
                      {safeArray(clients).map(c => <SelectItem key={c?.id} value={c?.id} className="text-xs">{c?.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2" colSpan={3}>
                  <input
                    type="text" value={newTask.title}
                    onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addTask()}
                    placeholder="+ Add a task..."
                    className="w-full text-xs px-2 py-1 bg-transparent border border-dashed border-gray-300 rounded focus:outline-none focus:border-blue-400 focus:bg-white"
                    disabled={addingTask}
                  />
                </td>
                <td colSpan={columnOrder.length - 6} className="px-3 py-2 text-right">
                  <Button
                    size="sm" variant="ghost" onClick={addTask}
                    disabled={addingTask || !newTask.title.trim() || !newTask.client_id || newTask.client_id === '__none__'}
                    className="text-xs h-7"
                  >
                    <Plus className="w-3 h-3 mr-1" />{addingTask ? 'Adding...' : 'Add'}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </DndContext>
      </div>
      <ConfirmDialog config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  )
}
