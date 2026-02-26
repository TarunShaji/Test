'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Plus, ExternalLink, Trash2, Link2, Settings, BarChart3, FileText } from 'lucide-react'

const STATUSES        = ['To Be Started', 'In Progress', 'To Be Approved', 'Completed', 'Recurring', 'Blocked']
const CATEGORIES      = ['SEO & Content', 'Design', 'Development', 'Page Speed', 'Technical SEO', 'Link Building', 'Paid Ads', 'Email Marketing', 'LLM SEO', 'Reporting', 'Other']
const PRIORITIES      = ['P0', 'P1', 'P2', 'P3']
const APPROVALS       = ['Pending Review', 'Approved', 'Required Changes']
const REPORT_TYPES    = ['Monthly SEO Report', 'Weekly Update', 'Audit Report', 'Ad Performance', 'Custom']
const SERVICE_TYPES   = ['SEO', 'Email Marketing', 'Paid Ads', 'SEO + Email', 'SEO + Paid Ads', 'All']
const OUTLINE_STATUSES = ['Pending', 'Submitted', 'Approved', 'Rejected']
const TOPIC_APPROVALS  = ['Pending', 'Approved', 'Rejected']
const BLOG_APPROVALS   = ['Pending Review', 'Approved', 'Changes Required']
const BLOG_STATUSES    = ['Draft', 'In Progress', 'Sent for Approval', 'Published', 'Rejected']

const statusColors = {
  'Completed':      'bg-green-100 text-green-700 border-green-200',
  'In Progress':    'bg-blue-100 text-blue-700 border-blue-200',
  'To Be Approved': 'bg-amber-100 text-amber-700 border-amber-200',
  'Blocked':        'bg-red-100 text-red-700 border-red-200',
  'To Be Started':  'bg-gray-100 text-gray-600 border-gray-200',
  'Recurring':      'bg-purple-100 text-purple-700 border-purple-200',
}
const priorityColors = {
  'P0': 'bg-red-100 text-red-700',
  'P1': 'bg-orange-100 text-orange-700',
  'P2': 'bg-yellow-100 text-yellow-700',
  'P3': 'bg-gray-100 text-gray-600',
}
const approvalColors = {
  'Approved':          'bg-green-100 text-green-700 border-green-200',
  'Required Changes':  'bg-red-100 text-red-700 border-red-200',
  'Pending Review':    'bg-gray-100 text-gray-500 border-gray-200',
}
const topicApprovalColors = {
  'Approved':  'bg-green-100 text-green-700 border-green-200',
  'Rejected':  'bg-red-100 text-red-700 border-red-200',
  'Pending':   'bg-gray-100 text-gray-500 border-gray-200',
}
const blogStatusColors = {
  'Published':         'bg-green-100 text-green-700 border-green-200',
  'Sent for Approval': 'bg-amber-100 text-amber-700 border-amber-200',
  'In Progress':       'bg-blue-100 text-blue-700 border-blue-200',
  'Draft':             'bg-gray-100 text-gray-600 border-gray-200',
  'Rejected':          'bg-red-100 text-red-700 border-red-200',
}

// ── Inline editable cell ──────────────────────────────────────────────────────
function EditableCell({ value, type = 'text', options = [], onSave, placeholder = '—' }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value || '')
  const inputRef              = useRef(null)

  useEffect(() => setVal(value || ''), [value])
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus() }, [editing])

  const save = () => { setEditing(false); if (val !== (value || '')) onSave(val) }

  if (editing) {
    if (type === 'select' || type === 'status' || type === 'priority' || type === 'approval') {
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
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[val] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
        {val || <span className="text-gray-300">—</span>}
      </span>
    )
    if (type === 'priority') return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${priorityColors[val] || 'bg-gray-100 text-gray-600'}`}>
        {val || <span className="text-gray-300">—</span>}
      </span>
    )
    if (type === 'approval') return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${approvalColors[val] || 'bg-gray-100 text-gray-500 border-gray-200'}`}>
        {val || 'Pending Review'}
      </span>
    )
    return <span className="text-xs text-gray-700">{val || <span className="text-gray-300">—</span>}</span>
  }

  return (
    <div onClick={() => setEditing(true)}
      className="cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 rounded px-1 py-0.5 min-h-[24px] min-w-[60px] transition-all"
      title="Click to edit">
      {display()}
    </div>
  )
}

// ── Link cell — shows icon when URL exists ────────────────────────────────────
function LinkCell({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value || '')
  const inputRef              = useRef(null)

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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { id } = useParams()
  const [client, setClient]       = useState(null)
  const [tasks, setTasks]         = useState([])
  const [reports, setReports]     = useState([])
  const [content, setContent]     = useState([])
  const [members, setMembers]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState({})
  const [newTask, setNewTask]     = useState({ title: '' })
  const [newContent, setNewContent] = useState({ blog_title: '' })
  const [addingTask, setAddingTask] = useState(false)
  const [addingContent, setAddingContent] = useState(false)
  const [showAddReport, setShowAddReport] = useState(false)
  const [reportForm, setReportForm] = useState({ title: '', report_type: 'Monthly SEO Report', report_url: '', report_date: '', notes: '' })
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({})
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

  const loadData = async () => {
    const [cr, tr, rr, mr, contr] = await Promise.all([
      apiFetch(`/api/clients/${id}`),
      apiFetch(`/api/tasks?client_id=${id}`),
      apiFetch(`/api/reports?client_id=${id}`),
      apiFetch('/api/team'),
      apiFetch(`/api/content?client_id=${id}`),
    ])
    const [cd, td, rd, md, contd] = await Promise.all([cr.json(), tr.json(), rr.json(), mr.json(), contr.json()])
    setClient(cd)
    setSettingsForm(cd)
    setTasks(Array.isArray(td) ? td : [])
    setReports(Array.isArray(rd) ? rd : [])
    setMembers(Array.isArray(md) ? md : [])
    setContent(Array.isArray(contd) ? contd : [])
    setLoading(false)
  }

  useEffect(() => { if (id) loadData() }, [id])

  const updateTask = async (taskId, field, value) => {
    setSaving(s => ({ ...s, [taskId]: true }))
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, [field]: value } : t))
    await apiFetch(`/api/tasks/${taskId}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) })
    setSaving(s => ({ ...s, [taskId]: false }))
  }

  const addTask = async () => {
    if (!newTask.title.trim()) return
    setAddingTask(true)
    const res = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ ...newTask, client_id: id }) })
    const task = await res.json()
    setTasks(ts => [task, ...ts])
    setNewTask({ title: '' })
    setAddingTask(false)
  }

  const deleteTask = async (taskId) => {
    if (!confirm('Delete this task?')) return
    await apiFetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    setTasks(ts => ts.filter(t => t.id !== taskId))
  }

  const addReport = async (e) => {
    e.preventDefault()
    const res = await apiFetch('/api/reports', { method: 'POST', body: JSON.stringify({ ...reportForm, client_id: id }) })
    const report = await res.json()
    setReports(rs => [report, ...rs])
    setShowAddReport(false)
    setReportForm({ title: '', report_type: 'Monthly SEO Report', report_url: '', report_date: '', notes: '' })
  }

  const saveSettings = async (e) => {
    e.preventDefault()
    await apiFetch(`/api/clients/${id}`, { method: 'PUT', body: JSON.stringify(settingsForm) })
    setClient(settingsForm)
    setShowSettings(false)
  }

  const deleteReport = async (reportId) => {
    if (!confirm('Delete this report?')) return
    await apiFetch(`/api/reports/${reportId}`, { method: 'DELETE' })
    setReports(rs => rs.filter(r => r.id !== reportId))
  }

  const updateContent = async (contentId, field, value) => {
    setSaving(s => ({ ...s, [`c_${contentId}`]: true }))
    setContent(cs => cs.map(c => c.id === contentId ? { ...c, [field]: value } : c))
    await apiFetch(`/api/content/${contentId}`, { method: 'PUT', body: JSON.stringify({ [field]: value }) })
    setSaving(s => ({ ...s, [`c_${contentId}`]: false }))
  }

  const addContent = async () => {
    if (!newContent.blog_title.trim()) return
    setAddingContent(true)
    const res = await apiFetch('/api/content', { method: 'POST', body: JSON.stringify({ ...newContent, client_id: id }) })
    const item = await res.json()
    setContent(cs => [item, ...cs])
    setNewContent({ blog_title: '' })
    setAddingContent(false)
  }

  const deleteContent = async (contentId) => {
    if (!confirm('Delete this content item?')) return
    await apiFetch(`/api/content/${contentId}`, { method: 'DELETE' })
    setContent(cs => cs.filter(c => c.id !== contentId))
  }

  const completedTasks = tasks.filter(t => t.status === 'Completed').length
  const progress       = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0
  const memberMap      = Object.fromEntries(members.map(m => [m.id, m.name]))
  const approvalCount  = tasks.filter(t => t.client_approval === 'Approved').length
  const changesCount   = tasks.filter(t => t.client_approval === 'Required Changes').length

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!client)  return <div className="p-8 text-gray-400">Client not found</div>

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
            <Link href="/dashboard/clients" className="hover:text-gray-600">Clients</Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">{client.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{client.service_type}</span>
            <a href={`${BASE_URL}/portal/${client.slug}`} target="_blank" rel="noopener noreferrer"
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
            <span className="text-sm text-gray-500">{completedTasks}/{tasks.length} completed</span>
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
            <div className="text-2xl font-bold text-gray-400">{tasks.filter(t => !t.client_approval || t.client_approval === 'Pending Review').length}</div>
            <div className="text-xs text-gray-400 mt-0.5">Pending</div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList className="mb-4">
          <TabsTrigger value="timeline">Timeline Tracker</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> Reports {reports.length > 0 && `(${reports.length})`}
          </TabsTrigger>
        </TabsList>

        {/* ── Timeline Tab ───────────────────────────────────────────────── */}
        <TabsContent value="timeline">
          <div className="bg-white border border-gray-200 rounded-lg overflow-auto">
            <table className="w-full text-sm" style={{ minWidth: '1100px' }}>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 sticky top-0 z-10">
                  <th className="w-5 px-2 py-2.5"></th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600" style={{ minWidth: 200 }}>Task</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Category</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Duration</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Status</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Priority</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">ETA Start</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">ETA End</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Assigned</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Client Approval</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Link / Doc</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Remarks</th>
                  <th className="px-2 py-2.5 w-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tasks.map(task => (
                  <tr key={task.id} className="hover:bg-gray-50 group">
                    <td className="px-2 py-1.5">
                      {saving[task.id] && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse mx-auto" />}
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.title} onSave={v => updateTask(task.id, 'title', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.category} type="select" options={CATEGORIES} onSave={v => updateTask(task.id, 'category', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.duration_days} onSave={v => updateTask(task.id, 'duration_days', v)} placeholder="e.g. 3-5" />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.status} type="status" options={STATUSES} onSave={v => updateTask(task.id, 'status', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.priority} type="priority" options={PRIORITIES} onSave={v => updateTask(task.id, 'priority', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.eta_start} type="date" onSave={v => updateTask(task.id, 'eta_start', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.eta_end} type="date" onSave={v => updateTask(task.id, 'eta_end', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell
                        value={memberMap[task.assigned_to] || ''}
                        type="select"
                        options={members.map(m => m.name)}
                        onSave={v => {
                          const member = members.find(m => m.name === v)
                          updateTask(task.id, 'assigned_to', member?.id || null)
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.client_approval || 'Pending Review'} type="approval" options={APPROVALS} onSave={v => updateTask(task.id, 'client_approval', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <LinkCell value={task.link_url} onSave={v => updateTask(task.id, 'link_url', v)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell value={task.remarks} onSave={v => updateTask(task.id, 'remarks', v)} placeholder="Notes..." />
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => deleteTask(task.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {/* Add row */}
                <tr className="bg-gray-50 border-t border-dashed border-gray-200">
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
                  <td colSpan={11} className="px-3 py-2">
                    <Button size="sm" variant="ghost" onClick={addTask} disabled={addingTask || !newTask.title.trim()} className="text-xs h-7">
                      <Plus className="w-3 h-3 mr-1" />{addingTask ? 'Adding...' : 'Add'}
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── Reports Tab ───────────────────────────────────────────────── */}
        <TabsContent value="reports">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowAddReport(true)} size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> Add Report
            </Button>
          </div>
          {reports.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-200" />
              No reports yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map(report => (
                <Card key={report.id} className="border border-gray-200 hover:shadow-md transition-shadow">
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
