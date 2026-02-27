'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Mail, UserCircle } from 'lucide-react'

const ROLES = ['SEO', 'Design', 'Tech', 'Account Manager', 'Admin']

const roleColors = {
  'SEO': 'bg-green-100 text-green-700',
  'Design': 'bg-pink-100 text-pink-700',
  'Tech': 'bg-blue-100 text-blue-700',
  'Account Manager': 'bg-purple-100 text-purple-700',
  'Admin': 'bg-gray-100 text-gray-700',
}

export default function TeamPage() {
  const [members, setMembers] = useState([])
  const [tasks, setTasks] = useState([])
  const [selectedMember, setSelectedMember] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('members') // 'members' | 'tasks'

  const loadData = async () => {
    try {
      const [mr, tr] = await Promise.all([apiFetch('/api/team'), apiFetch('/api/tasks')])
      const [m, t] = await Promise.all([mr.json(), tr.json()])
      setMembers(Array.isArray(m) ? m : [])
      setTasks(Array.isArray(t) ? t : [])
    } catch (e) {
      console.error('Failed to load team data', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])


  const deactivate = async (id) => {
    if (!confirm('Remove this team member?')) return
    await apiFetch(`/api/team/${id}`, { method: 'DELETE' })
    setMembers(m => m.filter(x => x.id !== id))
  }

  const filtered = selectedMember
    ? tasks.filter(t => t.assigned_to === selectedMember)
    : tasks

  const byClient = filtered.reduce((acc, task) => {
    const key = task.client_name || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})

  const statusColors = {
    'Completed': 'bg-green-100 text-green-700',
    'In Progress': 'bg-blue-100 text-blue-700',
    'To Be Approved': 'bg-amber-100 text-amber-700',
    'Blocked': 'bg-red-100 text-red-700',
    'To Be Started': 'bg-gray-100 text-gray-600',
    'Recurring': 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500 text-sm mt-1">{members.length} team members</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('members')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'members' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Members</button>
        <button onClick={() => setTab('tasks')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'tasks' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>Tasks by Member</button>
      </div>

      {tab === 'members' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading ? <p className="text-gray-400 col-span-4">Loading...</p> : members.map(m => {
            const memberTasks = tasks.filter(t => t.assigned_to === m.id)
            const active = memberTasks.filter(t => t.status === 'In Progress').length
            return (
              <Card key={m.id} className="border border-gray-200 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-700 font-bold text-base">{m.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <button onClick={() => deactivate(m.id)} className="p-1 rounded hover:bg-red-50 text-gray-200 hover:text-red-400 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-3">
                    <p className="font-semibold text-gray-900">{m.name}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${roleColors[m.role] || 'bg-gray-100 text-gray-600'}`}>{m.role}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                    <Mail className="w-3 h-3" />
                    <span className="truncate">{m.email}</span>
                  </div>
                  <div className="flex gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                    <span><b className="text-gray-800">{memberTasks.length}</b> tasks</span>
                    <span><b className="text-blue-600">{active}</b> active</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'tasks' && (
        <div>
          {/* Member picker */}
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setSelectedMember('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${!selectedMember ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >All Members</button>
            {members.map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMember(selectedMember === m.id ? '' : m.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedMember === m.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
              >{m.name}</button>
            ))}
          </div>

          {loading ? <p className="text-gray-400">Loading...</p> : (
            <div className="space-y-4">
              {Object.entries(byClient).map(([clientName, clientTasks]) => (
                <Card key={clientName} className="border border-gray-200">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-800">{clientName}</span>
                    <span className="text-xs text-gray-400">{clientTasks.length} tasks</span>
                  </div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-gray-50">
                      {clientTasks.map(task => (
                        <tr key={task.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-800">{task.title}</td>
                          <td className="px-4 py-2 text-gray-400">{task.category}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[task.status] || 'bg-gray-100 text-gray-600'}`}>{task.status}</span>
                          </td>
                          <td className="px-4 py-2 text-gray-400">{task.eta_end || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              ))}
              {Object.keys(byClient).length === 0 && (
                <div className="text-center py-12 text-gray-400">{selectedMember ? 'No tasks assigned to this member' : 'No tasks found'}</div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
