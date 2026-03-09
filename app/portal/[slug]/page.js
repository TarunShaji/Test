'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExternalLink, BarChart3, CheckCircle2, Loader2, Lock, Link2, FileText, Library, Folder, Image } from 'lucide-react'
import { safeURL, safeJSON, safeArray } from '@/lib/safe'
import { normalizeUrl } from '@/lib/utils'

import useSWR, { mutate } from 'swr'
import {
  statusColors, approvalColors, topicApprovalColors, blogStatusColors,
  APPROVALS, TOPIC_APPROVALS, BLOG_APPROVALS, TASK_COLUMN_WIDTHS
} from '@/lib/constants'

const typeColors = {
  'Monthly SEO Report': 'bg-blue-50 text-blue-700',
  'Weekly Update': 'bg-green-50 text-green-700',
  'Audit Report': 'bg-purple-50 text-purple-700',
  'Ad Performance': 'bg-orange-50 text-orange-700',
  'Custom': 'bg-gray-50 text-gray-600',
}

const APPROVAL_OPTIONS = APPROVALS
const TOPIC_APPROVAL_OPTIONS = TOPIC_APPROVALS
const BLOG_APPROVAL_OPTIONS = BLOG_APPROVALS

function ApprovalButton({ taskId, current, slug, portalPassword, disabled, service, onUpdate }) {
  const [loading, setLoading] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')
  const [pendingChoice, setPendingChoice] = useState(null)
  const val = current || 'Pending Review'

  const set = async (choice) => {
    if (choice === current) return

    if (choice === 'Required Changes') {
      setPendingChoice(choice)
      setShowNote(true)
      return
    }

    await submit(choice)
  }

  const submit = async (choice, feedbackNote = '') => {
    setLoading(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (portalPassword) headers['X-Portal-Password'] = portalPassword

      const res = await fetch(`/api/portal/${slug}/tasks/${taskId}/approval`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          client_approval: choice,
          client_feedback_note: feedbackNote,
          service: service || 'seo'
        }),
      })
      if (res.ok) {
        onUpdate(taskId, choice)
        setShowNote(false)
        setNote('')
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to update approval')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <Select value={val} onValueChange={set} disabled={loading || disabled}>
        <SelectTrigger className={`h-8 text-xs rounded-full border ring-offset-0 focus:ring-1 focus:ring-blue-400 ${approvalColors[val]}`}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {APPROVAL_OPTIONS.map(opt => (
            <SelectItem key={opt} value={opt} className="text-xs text-gray-700">
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${opt === 'Approved' ? 'bg-green-500' : opt === 'Required Changes' ? 'bg-red-500' : 'bg-gray-300'}`} />
                {opt}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showNote && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-sm shadow-2xl">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Required Changes</h3>
              <p className="text-xs text-gray-500 mb-4">Please provide feedback so the team can address your concerns.</p>
              <textarea
                autoFocus
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Describe what needs to be changed..."
                className="w-full h-24 text-xs p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4 resize-none"
              />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { setShowNote(false); setNote(''); }}>Cancel</Button>
                <Button size="sm" className="flex-1 text-xs bg-red-600 hover:bg-red-700" onClick={() => submit(pendingChoice, note)} disabled={!note.trim() || loading}>
                  {loading ? 'Submitting...' : 'Submit Feedback'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// Topic approval button for content calendar
function TopicApprovalButton({ contentId, current, slug, portalPassword, onUpdate }) {
  const [loading, setLoading] = useState(false)
  const val = current || 'Pending'

  const set = async (choice) => {
    if (choice === current) return
    setLoading(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (portalPassword) headers['X-Portal-Password'] = portalPassword

      const res = await fetch(`/api/portal/${slug}/content/${contentId}/approval`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ topic_approval_status: choice }),
      })
      if (res.ok) onUpdate(contentId, 'topic_approval_status', choice)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <Select value={val} onValueChange={set} disabled={loading}>
        <SelectTrigger className={`h-8 text-xs rounded-full border ring-offset-0 focus:ring-1 focus:ring-blue-400 ${topicApprovalColors[val]}`}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TOPIC_APPROVAL_OPTIONS.map(opt => (
            <SelectItem key={opt} value={opt} className="text-xs">
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${opt === 'Approved' ? 'bg-green-500' : opt === 'Rejected' ? 'bg-red-500' : 'bg-gray-300'}`} />
                {opt}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// Blog approval button for content calendar — with feedback modal on "Changes Required"
function BlogApprovalButton({ contentId, current, slug, portalPassword, onUpdate }) {
  const [loading, setLoading] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState('')
  const [pendingChoice, setPendingChoice] = useState(null)
  const val = current || 'Pending Review'

  const set = async (choice) => {
    if (choice === current) return

    if (choice === 'Changes Required') {
      setPendingChoice(choice)
      setShowNote(true)
      return
    }

    await submit(choice)
  }

  const submit = async (choice, feedbackNote = '') => {
    setLoading(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (portalPassword) headers['X-Portal-Password'] = portalPassword

      const res = await fetch(`/api/portal/${slug}/content/${contentId}/approval`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          blog_approval_status: choice,
          blog_client_feedback_note: feedbackNote
        }),
      })
      if (res.ok) {
        onUpdate(contentId, 'blog_approval_status', choice)
        if (feedbackNote) onUpdate(contentId, 'blog_client_feedback_note', feedbackNote)
        setShowNote(false)
        setNote('')
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to update approval')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <Select value={val} onValueChange={set} disabled={loading}>
        <SelectTrigger className={`h-8 text-xs rounded-full border ring-offset-0 focus:ring-1 focus:ring-blue-400 ${approvalColors[val]}`}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BLOG_APPROVAL_OPTIONS.map(opt => (
            <SelectItem key={opt} value={opt} className="text-xs">
              <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${opt === 'Approved' ? 'bg-green-500' : opt === 'Changes Required' ? 'bg-red-500' : 'bg-gray-300'}`} />
                {opt}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showNote && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <Card className="w-full max-w-sm shadow-2xl">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Changes Required</h3>
              <p className="text-xs text-gray-500 mb-4">Please describe what changes are needed for this blog post.</p>
              <textarea
                autoFocus
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Describe what needs to be changed..."
                className="w-full h-24 text-xs p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent mb-4 resize-none"
              />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => { setShowNote(false); setNote(''); }}>Cancel</Button>
                <Button size="sm" className="flex-1 text-xs bg-red-600 hover:bg-red-700" onClick={() => submit(pendingChoice, note)} disabled={!note.trim() || loading}>
                  {loading ? 'Submitting...' : 'Submit Feedback'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


export default function ClientPortalPage() {
  const { slug } = useParams()
  const [password, setPassword] = useState('')
  const [portalPassword, setPortalPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [showAddResource, setShowAddResource] = useState(false)
  const [resourceForm, setResourceForm] = useState({ name: '', url: '' })
  const [addingResource, setAddingResource] = useState(false)
  const [portalService, setPortalService] = useState('seo')
  const [activeTab, setActiveTab] = useState('progress')

  const portalFetcher = async ([url, pwd]) => {
    const headers = { 'Content-Type': 'application/json' }
    if (pwd) headers['X-Portal-Password'] = pwd
    const res = await fetch(url, { headers })
    const json = await res.json()
    if (!res.ok) {
      const err = new Error(json.error || 'Failed to fetch')
      err.status = res.status
      err.info = json
      throw err
    }
    return json
  }

  const progressKey = slug
    ? [`/api/portal/${slug}?include=client,tasks&service=${portalService}`, portalPassword]
    : null
  const contentKey = slug && activeTab === 'content'
    ? [`/api/portal/${slug}?include=content`, portalPassword]
    : null
  const resourcesKey = slug && activeTab === 'resources'
    ? [`/api/portal/${slug}?include=resources`, portalPassword]
    : null
  const reportsKey = slug && activeTab === 'reports'
    ? [`/api/portal/${slug}?include=reports`, portalPassword]
    : null

  const { data: progressData, error: swrErr, isValidating } = useSWR(
    progressKey,
    portalFetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  )
  const { data: contentData, isValidating: loadingContentTab } = useSWR(
    contentKey,
    portalFetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  )
  const { data: resourcesData, isValidating: loadingResourcesTab } = useSWR(
    resourcesKey,
    portalFetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  )
  const { data: reportsData, isValidating: loadingReportsTab } = useSWR(
    reportsKey,
    portalFetcher,
    { shouldRetryOnError: false, revalidateOnFocus: false }
  )

  const tasks = safeArray(progressData?.tasks)
  const content = safeArray(contentData?.content)
  const client = progressData?.client
  const reports = safeArray(reportsData?.reports)
  const resources = safeArray(resourcesData?.resources)

  const loading = isValidating && !progressData
  const needsPassword = swrErr?.status === 401 && swrErr?.info?.has_password
  const clientName = swrErr?.info?.client_name || ''
  const error = swrErr?.status !== 401 ? swrErr?.message : null

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPortalPassword(password)
  }

  useEffect(() => {
    if (swrErr?.status === 401 && portalPassword) {
      setPasswordError('Incorrect password')
    }
  }, [swrErr, portalPassword])

  useEffect(() => {
    if (client?.service_type) {
      const srv = client.service_type.toLowerCase()
      if (srv.includes('email')) setPortalService('email')
      else if (srv.includes('paid')) setPortalService('paid')
      else setPortalService('seo')
    }
  }, [client])

  const handleUpdate = (type, id, field, val) => {
    const mutateKey = type === 'task' ? progressKey : contentKey
    mutate(mutateKey, (current) => {
      if (!current) return current
      if (type === 'task') {
        return { ...current, tasks: safeArray(current.tasks).map(t => t?.id === id ? { ...t, [field]: val } : t) }
      } else {
        return { ...current, content: safeArray(current.content).map(c => c?.id === id ? { ...c, [field]: val } : c) }
      }
    }, false)
  }

  const handleApprovalUpdate = (taskId, val) => handleUpdate('task', taskId, 'client_approval', val)
  const handleContentApprovalUpdate = (contentId, field, val) => handleUpdate('content', contentId, field, val)

  const addResourceFromPortal = async (e) => {
    e.preventDefault()
    if (!resourceForm.name.trim() || !resourceForm.url.trim()) return
    setAddingResource(true)
    try {
      const res = await fetch(`/api/clients/${client?.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-slug': slug, 'x-portal-password': portalPassword || '' },
        body: JSON.stringify({ name: resourceForm.name.trim(), url: resourceForm.url.trim(), type: 'link', category: 'Shared' })
      })
      if (res.ok) {
        const newRes = await res.json()
        mutate(resourcesKey, (cur) => cur ? { ...cur, resources: [...safeArray(cur.resources), newRes] } : cur, false)
        setResourceForm({ name: '', url: '' })
        setShowAddResource(false)
      } else {
        alert('Failed to add resource')
      }
    } catch { alert('Network error') } finally { setAddingResource(false) }
  }

  // ── Password gate ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
    </div>
  )

  if (needsPassword) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">{clientName || 'Client Portal'}</h1>
          <p className="text-slate-400 mt-1">This portal is password protected</p>
        </div>
        <Card className="border-0 shadow-2xl">
          <CardContent className="p-6">
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Password</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Enter portal password" required className="mt-1" autoFocus />
              </div>
              {passwordError && <p className="text-sm text-red-500">{passwordError}</p>}
              <Button type="submit" className="w-full">Access Portal</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center"><div className="text-gray-300 text-6xl mb-4">404</div><p className="text-gray-500">{error}</p></div>
    </div>
  )
  if (!progressData) return null

  // data is already destructured into client and reports above
  const currentTasks = safeArray(tasks).filter(t => t.service === portalService)
  const completed = currentTasks.filter(t => t?.status === 'Completed').length
  const progress = currentTasks.length > 0 ? Math.round((completed / currentTasks.length) * 100) : 0
  const approved = currentTasks.filter(t => t?.client_approval === 'Approved').length
  const changes = currentTasks.filter(t => t?.client_approval === 'Required Changes').length
  const pending = currentTasks.filter(t => !t?.client_approval || t?.client_approval === 'Pending Review').length

  const filteredTasks = currentTasks

  const lastUpdated = currentTasks.length > 0
    ? new Date(Math.max(...currentTasks.map(t => new Date(t?.updated_at || t?.created_at)))).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">{client?.name?.charAt(0)}</span>
            </div>
            <div>
              <h1 className="font-bold text-gray-900">{client?.name}</h1>
              <p className="text-xs text-gray-400">{client?.service_type} · CubeHQ</p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{client?.service_type}</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Progress + stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="md:col-span-3 bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">{portalService === 'email' ? 'Email' : portalService === 'paid' ? 'Paid Ads' : 'SEO'} Progress</h2>
              <span className="text-sm text-gray-500">{completed}/{currentTasks.length} completed</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className="h-3 rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#3b82f6,#1d4ed8)' }} />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs text-gray-400">{progress}% complete</span>
              {lastUpdated && <span className="text-xs text-gray-400">Updated {lastUpdated}</span>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2 justify-center">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Approved</span>
              <span className="font-bold text-green-600">{approved}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Changes Req.</span>
              <span className="font-bold text-red-500">{changes}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Pending Review</span>
              <span className="font-bold text-gray-400">{pending}</span>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="progress" className="gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Project Progress
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-1.5">
              <FileText className="w-4 h-4" /> Content Calendar {content.length > 0 && `(${content.length})`}
            </TabsTrigger>
            <TabsTrigger value="resources" className="gap-1.5">
              <Library className="w-4 h-4" /> Resources {resources.length > 0 && `(${resources.length})`}
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-1.5">
              <BarChart3 className="w-4 h-4" /> Reports {reports.length > 0 && `(${reports.length})`}
            </TabsTrigger>
          </TabsList>

          {/* ── Progress Tab ────────────────────────────────────────────── */}
          <TabsContent value="progress">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 px-1">
              <div className="flex items-center gap-4">
                <p className="text-xs text-gray-500 mr-2">Your approval:</p>
                {[['Approved', 'bg-green-500'], ['Required Changes', 'bg-red-500'], ['Pending Review', 'bg-gray-300']].map(([l, c]) => (
                  <span key={l} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${c}`} />{l}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500">Service:</span>
                <Select value={portalService} onValueChange={setPortalService}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seo" className="text-xs">SEO Tasks</SelectItem>
                    <SelectItem value="email" className="text-xs">Email Tasks</SelectItem>
                    <SelectItem value="paid" className="text-xs">Paid Ads Tasks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="text-center py-16 text-gray-400">No tasks yet.</div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: '1000px' }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-5 py-2 text-xs font-semibold text-gray-500" style={{ width: TASK_COLUMN_WIDTHS.title }}>Task</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500" style={{ width: TASK_COLUMN_WIDTHS.status }}>Status</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500" style={{ width: TASK_COLUMN_WIDTHS.eta }}>{portalService === 'email' ? 'Campaign Live' : 'ETA End'}</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500" style={{ width: TASK_COLUMN_WIDTHS.client_feedback || '200px' }}>Notes</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500" style={{ width: TASK_COLUMN_WIDTHS.link }}>Link</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500" style={{ width: TASK_COLUMN_WIDTHS.client_approval }}>Your Approval</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {safeArray(filteredTasks).map(task => (
                      <tr key={task?.id} className="hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                        <td className="px-5 py-4 font-medium text-gray-800 text-sm truncate" title={task?.title}>{task?.title}</td>
                        <td className="px-4 py-4 overflow-hidden">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border whitespace-nowrap ${statusColors[task?.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {task?.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-xs text-gray-500 truncate">{task?.eta_end || task?.campaign_live_date || task?.campaign_live || '—'}</td>
                        <td className="px-4 py-4 text-xs text-gray-500 truncate" title={task?.client_approval === 'Required Changes' ? task?.client_feedback_note : (task?.remarks || '')}>
                          {task?.client_approval === 'Required Changes' ? task?.client_feedback_note : (task?.remarks || '—')}
                        </td>
                        <td className="px-4 py-4 text-center overflow-hidden">
                          {task?.client_link_visible && task?.link_url ? (
                            <a href={normalizeUrl(task.link_url)} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white text-xs font-bold transition-all shadow-sm whitespace-nowrap">
                              <Link2 className="w-3.5 h-3.5" /> View
                            </a>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-gray-300 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                              <Lock className="w-3 h-3" /> Pending Review
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <ApprovalButton
                            taskId={task?.id}
                            current={task?.client_approval}
                            slug={slug}
                            portalPassword={portalPassword}
                            disabled={!task?.client_link_visible}
                            service={task?.service}
                            onUpdate={handleApprovalUpdate}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── Content Calendar Tab ──────────────────────────────────────── */}
          <TabsContent value="content">
            {loadingContentTab && (
              <div className="text-center py-6 text-gray-400">Loading content...</div>
            )}
            {content.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">No content calendar items yet.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
                <table className="w-full text-sm" style={{ minWidth: '1050px' }}>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500" style={{ minWidth: 60 }}>Week</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500" style={{ minWidth: 200 }}>Blog Title</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Keyword</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Blog Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Blog Doc</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Topic Approval</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Blog Approval</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Your Feedback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {safeArray(content).map(item => (
                      <tr key={item?.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">{item?.week || '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 text-sm">{item?.blog_title}</p>
                          {item?.blog_type && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item?.blog_type}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item?.primary_keyword || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${blogStatusColors[item?.blog_status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {item?.blog_status || 'Draft'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {item?.client_link_visible_blog && (item?.blog_doc_link || item?.blog_link) ? (
                            <a href={normalizeUrl(item.blog_doc_link || item.blog_link)} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white text-xs font-bold transition-all shadow-sm whitespace-nowrap">
                              <Link2 className="w-3.5 h-3.5" /> View Draft
                            </a>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-gray-300 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                              <Lock className="w-3 h-3" /> Not Ready
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <TopicApprovalButton
                            contentId={item?.id}
                            current={item?.topic_approval_status}
                            slug={slug}
                            portalPassword={portalPassword}
                            onUpdate={handleContentApprovalUpdate}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <BlogApprovalButton
                            contentId={item?.id}
                            current={item?.blog_approval_status}
                            slug={slug}
                            portalPassword={portalPassword}
                            disabled={!item?.client_link_visible_blog}
                            onUpdate={handleContentApprovalUpdate}
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 truncate max-w-[160px]" title={item?.blog_approval_status === 'Changes Required' ? item?.blog_client_feedback_note : ''}>
                          {item?.blog_approval_status === 'Changes Required' ? (
                            <span className="text-red-600 text-[10px] bg-red-50 px-1 py-0.5 rounded border border-red-100 line-clamp-2">{item?.blog_client_feedback_note || 'Changes requested'}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legend for content approvals */}
            {content.length > 0 && (
              <div className="flex items-center gap-6 mt-4 px-1">
                <p className="text-xs text-gray-500">Your approval options:</p>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-green-500" />Approved
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-red-500" />Rejected / Changes Required
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2 h-2 rounded-full bg-gray-300" />Pending
                  </span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Resources Tab ────────────────────────────────────────────── */}
          <TabsContent value="resources">
            {loadingResourcesTab && (
              <div className="text-center py-6 text-gray-400">Loading resources...</div>
            )}
            <div className="flex justify-end mb-4">
              <Button size="sm" className="gap-1.5" onClick={() => setShowAddResource(true)}>
                <span className="text-base leading-none">+</span> Add Resource
              </Button>
            </div>
            {resources.length === 0 ? (
              <div className="text-center py-16">
                <Library className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">No resources shared yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {safeArray(resources).map(res => (
                  <Card key={res?.id} className="border border-gray-200 hover:shadow-md transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
                          {res?.type === 'image' ? <Image className="w-6 h-6" /> :
                            res?.type === 'folder' ? <Folder className="w-6 h-6" /> :
                              <Link2 className="w-6 h-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 block mb-1">{res?.category || 'Asset'}</span>
                          <h3 className="font-bold text-gray-900 truncate">{res?.name}</h3>
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {safeURL(res?.url)?.hostname || 'resource'}
                          </p>
                          <a href={normalizeUrl(res?.url)} target="_blank" rel="noopener noreferrer"
                            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors w-full justify-center shadow-sm">
                            View Resource <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Reports Tab ─────────────────────────────────────────────── */}
          <TabsContent value="reports">
            {loadingReportsTab && (
              <div className="text-center py-6 text-gray-400">Loading reports...</div>
            )}
            {reports.length === 0 ? (
              <div className="text-center py-16">
                <BarChart3 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">No reports yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.map(report => (
                  <Card key={report.id} className="border border-gray-200 hover:shadow-md transition-all">
                    <CardContent className="p-5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-3 ${typeColors[report.report_type] || 'bg-gray-50 text-gray-600'}`}>
                        {report.report_type}
                      </span>
                      <h3 className="font-semibold text-gray-900">{report.title}</h3>
                      <p className="text-sm text-gray-400 mt-0.5">{report.report_date}</p>
                      {report.notes && <p className="text-sm text-gray-500 mt-2">{report.notes}</p>}
                      <a href={normalizeUrl(report.report_url)} target="_blank" rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                        View Report <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center text-xs text-gray-300">Powered by CubeHQ</div>
      </div>

      {/* ── Add Resource Modal ────────────────────────────────────────────── */}
      {showAddResource && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowAddResource(false) }}>
          <Card className="w-full max-w-sm shadow-2xl">
            <CardContent className="p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Add Resource</h3>
              <p className="text-xs text-gray-400 mb-4">Share a link with your agency team.</p>
              <form onSubmit={addResourceFromPortal} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Name</label>
                  <Input
                    autoFocus
                    placeholder="e.g. Brand Guidelines"
                    value={resourceForm.name}
                    onChange={e => setResourceForm(f => ({ ...f, name: e.target.value }))}
                    className="h-8 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">URL</label>
                  <Input
                    placeholder="https://drive.google.com/..."
                    value={resourceForm.url}
                    onChange={e => setResourceForm(f => ({ ...f, url: e.target.value }))}
                    className="h-8 text-sm"
                    required
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="button" variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => setShowAddResource(false)}>Cancel</Button>
                  <Button type="submit" size="sm" className="flex-1 text-xs" disabled={addingResource || !resourceForm.name.trim() || !resourceForm.url.trim()}>
                    {addingResource ? 'Adding...' : 'Add Resource'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div >
  )
}
