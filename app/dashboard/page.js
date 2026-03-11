'use client'

import { useState, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { apiFetch, swrFetcher } from '@/lib/middleware/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Plus, ExternalLink, Search } from 'lucide-react'
import { SERVICE_TYPES } from '@/lib/constants'
import { safeArray } from '@/lib/safe'

/**
 * Inline member-select cell — shows member name, click to open dropdown, saves on select.
 */
function MemberSelectCell({ client, field, members, onSave }) {
  const [open, setOpen] = useState(false)
  const value = client?.[field]
  const isChurned = client?.is_churned === true
  const currentMember = members.find(m => m.id === value)

  const handleChange = (memberId) => {
    setOpen(false)
    if (memberId === '__churned__') {
      const ok = typeof window !== 'undefined'
        ? window.confirm('Are you sure you want to mark this client as churned?')
        : true
      if (ok) onSave({ is_churned: true })
      return
    }

    const newVal = memberId === '__none__' ? null : memberId
    const patch = { [field]: newVal }
    if (field === 'npl_member_id') patch.is_churned = false
    if (newVal !== value || field === 'npl_member_id') onSave(patch)
  }

  if (isChurned && field !== 'npl_member_id') {
    return (
      <span className="inline-flex items-center text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
        Churned
      </span>
    )
  }

  if (open) {
    return (
      <Select
        defaultOpen
        value={value || '__none__'}
        onValueChange={handleChange}
        onOpenChange={o => { if (!o) setOpen(false) }}
      >
        <SelectTrigger
          className="h-7 text-xs border-blue-400 min-w-[120px]"
          onClick={e => e.stopPropagation()}
        >
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent onClick={e => e.stopPropagation()}>
          {field === 'npl_member_id' && (
            <SelectItem value="__churned__">
              <span className="text-red-600 text-xs font-semibold">Churned</span>
            </SelectItem>
          )}
          <SelectItem value="__none__"><span className="text-gray-400 text-xs">— Unassigned</span></SelectItem>
          {members.map(m => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <span
      className={`cursor-pointer text-xs px-1.5 py-0.5 rounded transition-colors ${isChurned
        ? 'bg-red-100 text-red-700 hover:bg-red-200 font-semibold'
        : currentMember
          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
        }`}
      onClick={e => { e.stopPropagation(); setOpen(true) }}
      title="Click to assign member"
    >
      {isChurned ? 'Churned' : (currentMember ? currentMember.name : '—')}
    </span>
  )
}

function EditableEmailCell({ value, onSave }) {
  const [isEditing, setIsEditing] = useState(false)
  const [temp, setTemp] = useState(value || '')

  const handleBlur = () => {
    setIsEditing(false)
    if (temp !== (value || '')) onSave(temp)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleBlur()
    if (e.key === 'Escape') {
      setIsEditing(false)
      setTemp(value || '')
    }
  }

  if (isEditing) {
    return (
      <Input
        autoFocus
        value={temp}
        onChange={e => setTemp(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="h-7 text-xs border-blue-400 min-w-[150px]"
        onClick={e => e.stopPropagation()}
      />
    )
  }

  return (
    <div
      className={`cursor-pointer px-2 py-1 rounded transition-colors text-xs truncate max-w-[200px] ${value ? 'text-gray-700 hover:bg-gray-100' : 'text-gray-300 hover:bg-gray-50'}`}
      onClick={e => { e.stopPropagation(); setIsEditing(true) }}
      title="Click to edit emails"
    >
      {value || 'Add emails...'}
    </div>
  )
}

function DashboardPageContent() {
  const router = useRouter()
  const { data: clients, mutate, error } = useSWR('/api/clients', swrFetcher)
  const { data: membersData } = useSWR('/api/team', swrFetcher)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', service_type: 'SEO', portal_password: '', email: '' })
  const [saving, setSaving] = useState(false)
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || ''

  const clientList = safeArray(clients)
  const members = safeArray(membersData)

  const filtered = useMemo(() =>
    clientList
      .filter(c =>
        c?.name?.toLowerCase().includes(search.toLowerCase()) ||
        c?.service_type?.toLowerCase().includes(search.toLowerCase()) ||
        c?.email?.toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        const ac = a?.is_churned === true ? 1 : 0
        const bc = b?.is_churned === true ? 1 : 0
        return ac - bc
      })
    , [clientList, search])

  const handleAdd = async (e) => {
    e.preventDefault()
    setSaving(true)
    const res = await apiFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify(form)
    })
    if (res.ok) {
      setShowAdd(false)
      setForm({ name: '', service_type: 'SEO', portal_password: '', email: '' })
      mutate()
    }
    setSaving(false)
  }

  const updateClientFields = async (clientId, patch) => {
    // Optimistic local update
    mutate(
      clientList.map(c => c.id === clientId ? { ...c, ...patch } : c),
      false
    )
    try {
      await apiFetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        body: JSON.stringify(patch)
      })
    } catch (e) {
      console.error('updateClientFields failed', e)
    }
    mutate()
  }

  if (!clients && !error) return <div className="p-8 text-gray-400">Loading dashboard...</div>

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{clientList.filter(c => c?.is_active !== false).length} active clients</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add Client
        </Button>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Clients Table */}
      <Card className="border border-gray-200">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Client Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Service Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600" title="NPL: Assigned member">NPL</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600" title="TPL: Assigned member">TPL</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600" title="CPL: Assigned member">CPL</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Active Tasks</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Portal</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    {clientList.length === 0 ? 'No clients yet. Add your first client!' : 'No clients match your search.'}
                  </td>
                </tr>
              ) : filtered.map(client => (
                <tr
                  key={client.id}
                  className={`cursor-pointer ${client?.is_churned ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'}`}
                  onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                >
                  {/* Client Name */}
                  <td className="px-4 py-3">
                    <div className={`font-medium ${client?.is_churned ? 'text-red-700' : 'text-gray-900'}`}>{client.name}</div>
                  </td>

                  {/* Service Type */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${client?.is_churned ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      {client?.is_churned ? 'Churned' : client.service_type}
                    </span>
                  </td>

                  {/* NPL — member dropdown */}
                  <td className="px-4 py-3">
                    <MemberSelectCell
                      client={client}
                      field="npl_member_id"
                      members={members}
                      onSave={patch => updateClientFields(client.id, patch)}
                    />
                  </td>

                  {/* TPL — member dropdown */}
                  <td className="px-4 py-3">
                    <MemberSelectCell
                      client={client}
                      field="tpl_member_id"
                      members={members}
                      onSave={patch => updateClientFields(client.id, patch)}
                    />
                  </td>

                  {/* CPL — member dropdown */}
                  <td className="px-4 py-3">
                    <MemberSelectCell
                      client={client}
                      field="cpl_member_id"
                      members={members}
                      onSave={patch => updateClientFields(client.id, patch)}
                    />
                  </td>

                  {/* Active Tasks */}
                  <td className="px-4 py-3 text-gray-700">{client.task_count || 0}</td>

                  {/* Email */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <EditableEmailCell
                      value={client.email}
                      onSave={v => updateClientFields(client.id, { email: v })}
                    />
                  </td>

                  {/* Portal Link */}
                  <td className="px-4 py-3">
                    <a
                      href={`${BASE_URL}/portal/${client.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                    >
                      /portal/{client.slug} <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>

                  {/* View button */}
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => { e.stopPropagation(); router.push(`/dashboard/clients/${client.id}`) }}
                    >
                      View →
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Client Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Bandolier" />
            </div>
            <div className="space-y-2">
              <Label>Service Type</Label>
              <Select value={form.service_type} onValueChange={v => setForm(f => ({ ...f, service_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Portal Password <span className="text-gray-400 text-xs">(optional)</span></Label>
              <Input value={form.portal_password} onChange={e => setForm(f => ({ ...f, portal_password: e.target.value }))} placeholder="Leave empty for public access" />
            </div>
            <div className="space-y-2">
              <Label>Contact Emails <span className="text-gray-400 text-xs">(optional, comma-separated)</span></Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. john@comp.com, sara@comp.com" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Adding...' : 'Add Client'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading dashboard...</div>}>
      <DashboardPageContent />
    </Suspense>
  )
}
