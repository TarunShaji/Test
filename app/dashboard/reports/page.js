'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/auth'
import { safeArray } from '@/lib/safe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, ExternalLink, Trash2 } from 'lucide-react'

const REPORT_TYPES = ['Monthly SEO Report', 'Weekly Update', 'Audit Report', 'Ad Performance', 'Custom']

const typeColors = {
  'Monthly SEO Report': 'bg-blue-50 text-blue-700',
  'Weekly Update': 'bg-green-50 text-green-700',
  'Audit Report': 'bg-purple-50 text-purple-700',
  'Ad Performance': 'bg-orange-50 text-orange-700',
  'Custom': 'bg-gray-50 text-gray-700',
}

export default function ReportsPage() {
  const [reports, setReports] = useState([])
  const [clients, setClients] = useState([])
  const [filterClient, setFilterClient] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title: '', client_id: '', report_type: 'Monthly SEO Report', report_url: '', report_date: '', notes: '' })

  const loadData = async () => {
    const params = filterClient ? `?client_id=${filterClient}` : ''
    const [rRes, cRes] = await Promise.all([apiFetch(`/api/reports${params}`), apiFetch('/api/clients')])
    const [r, c] = await Promise.all([rRes.json(), cRes.json()])
    setReports(r || [])
    setClients(c || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [filterClient])

  const addReport = async (e) => {
    e.preventDefault()
    const res = await apiFetch('/api/reports', { method: 'POST', body: JSON.stringify(form) })
    const report = await res.json()
    setReports(rs => [report, ...rs])
    setShowAdd(false)
    setForm({ title: '', client_id: '', report_type: 'Monthly SEO Report', report_url: '', report_date: '', notes: '' })
  }

  const deleteReport = async (id) => {
    if (!confirm('Delete this report?')) return
    await apiFetch(`/api/reports/${id}`, { method: 'DELETE' })
    setReports(rs => rs.filter(r => r.id !== id))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">{reports.length} reports</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-1" size="sm">
          <Plus className="w-4 h-4" /> Add Report
        </Button>
      </div>

      <div className="mb-4">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="All Clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Clients</SelectItem>
            {safeArray(clients).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No reports yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {safeArray(reports).map(report => (
            <Card key={report.id} className="border border-gray-200 hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-2 ${typeColors[report.report_type] || 'bg-gray-50 text-gray-700'
                      }`}>{report.report_type}</span>
                    <p className="font-medium text-gray-900 text-sm">{report.title}</p>
                    <p className="text-xs text-blue-600 font-medium mt-0.5">{report.client_name}</p>
                    <p className="text-xs text-gray-400 mt-1">{report.report_date}</p>
                    {report.notes && <p className="text-xs text-gray-500 mt-2">{report.notes}</p>}
                  </div>
                  <button onClick={() => deleteReport(report.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 flex-shrink-0">
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

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Report</DialogTitle></DialogHeader>
          <form onSubmit={addReport} className="space-y-3">
            <div>
              <label className="text-sm font-medium">Client</label>
              <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{safeArray(clients).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required className="mt-1" placeholder="May 2025 SEO Report" />
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={form.report_type} onValueChange={v => setForm(f => ({ ...f, report_type: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{safeArray(REPORT_TYPES).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Report URL</label>
              <Input value={form.report_url} onChange={e => setForm(f => ({ ...f, report_url: e.target.value }))} required className="mt-1" placeholder="https://docs.google.com/..." />
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={form.report_date} onChange={e => setForm(f => ({ ...f, report_date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" placeholder="Optional" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit">Add Report</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
