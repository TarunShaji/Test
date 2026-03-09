'use client'

import { useEffect, useState, Suspense } from 'react'
import { apiFetch } from '@/lib/middleware/auth'
import { safeArray } from '@/lib/safe'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2, Mail } from 'lucide-react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

function TeamPageContent() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState(null)
  const [memberTasks, setMemberTasks] = useState({ seo: [], email: [], paid: [] })
  const [loadingMemberTasks, setLoadingMemberTasks] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/team/workload')
      const payload = await res.json()
      setMembers(safeArray(payload))
    } catch (e) {
      console.error('Failed to load team data', e)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openMemberTasks = async (member) => {
    setSelectedMember(member)
    setLoadingMemberTasks(true)
    setMemberTasks({ seo: [], email: [], paid: [] })
    try {
      const res = await apiFetch(`/api/team/workload/${member.id}`)
      const payload = await res.json()
      setMemberTasks(payload?.services || { seo: [], email: [], paid: [] })
    } catch (e) {
      console.error('Failed to load member tasks', e)
      setMemberTasks({ seo: [], email: [], paid: [] })
    } finally {
      setLoadingMemberTasks(false)
    }
  }

  const deactivate = (id) => {
    setConfirmConfig({
      title: 'Remove Team Member',
      description: 'This will remove the team member from the system.',
      onConfirm: async () => {
        await apiFetch(`/api/team/${id}`, { method: 'DELETE' })
        setMembers(m => m.filter(x => x.id !== id))
        setSelectedMember(prev => (prev?.id === id ? null : prev))
      }
    })
  }

  const statusColors = {
    'Completed': 'bg-green-100 text-green-700',
    'In Progress': 'bg-blue-100 text-blue-700',
    'Pending Review': 'bg-amber-100 text-amber-700',
    'Blocked': 'bg-red-100 text-red-700',
    'To Be Started': 'bg-gray-100 text-gray-600',
    'Recurring': 'bg-purple-100 text-purple-700',
  }

  const serviceSections = [
    { key: 'seo', label: 'SEO' },
    { key: 'email', label: 'Email' },
    { key: 'paid', label: 'Paid Ads' },
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500 text-sm mt-1">{members.length} team members</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? <p className="text-gray-400 col-span-4">Loading...</p> : safeArray(members).map(m => (
          <Card
            key={m.id}
            className="border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => openMemberTasks(m)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-700 font-bold text-base">{m?.name?.charAt(0)?.toUpperCase()}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deactivate(m.id)
                  }}
                  className="p-1 rounded hover:bg-red-50 text-gray-200 hover:text-red-400 transition-all"
                  title="Remove team member"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="mt-3">
                <p className="font-semibold text-gray-900">{m?.name}</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 bg-blue-50 text-blue-700">Team</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                <Mail className="w-3 h-3" />
                <span className="truncate">{m?.email}</span>
              </div>
              <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                <span><b className="text-gray-800">{m?.workload?.total_tasks || 0}</b> tasks</span>
                <span><b className="text-blue-600">{m?.workload?.active_tasks || 0}</b> active</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedMember} onOpenChange={(open) => { if (!open) setSelectedMember(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedMember?.name || 'Member'} - Assigned Tasks
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
            {loadingMemberTasks && (
              <div className="text-sm text-gray-400">Loading tasks...</div>
            )}
            {serviceSections.map((section) => {
              const tasks = safeArray(memberTasks?.[section.key])
              return (
                <div key={section.key} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">{section.label}</span>
                    <span className="text-xs text-gray-500">{tasks.length} tasks</span>
                  </div>
                  {tasks.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-400">No assigned tasks</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {tasks.map((task) => (
                        <div key={task.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">{task.title}</p>
                            <p className="text-xs text-gray-500 truncate">{task.client_name}</p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusColors[task?.status] || 'bg-gray-100 text-gray-600'}`}>
                            {task.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog config={confirmConfig} onClose={() => setConfirmConfig(null)} />
    </div>
  )
}

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400">Loading team...</div>}>
      <TeamPageContent />
    </Suspense>
  )
}
