'use client'
import { useState, useEffect } from 'react'
import { parse, isValid, format } from 'date-fns'
import useSWR from 'swr'
import { apiFetch, swrFetcher } from '@/lib/auth'
import { safeArray } from '@/lib/safe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, CheckCircle, AlertCircle, Loader2, Key, RefreshCw, Link2 } from 'lucide-react'

// ────────── CSV HELPERS ──────────
const STATUS_MAP = {
  'implemented/ completed': 'Completed', 'implemented/completed': 'Completed',
  'completed': 'Completed', 'complete': 'Completed', 'done': 'Completed', 'fixed': 'Completed',
  'work in progress': 'In Progress', 'in progress': 'In Progress', 'wip': 'In Progress',
  'to be approved': 'To Be Approved', 'pending approval': 'To Be Approved',
  'recurring': 'Recurring', 'blocked': 'Blocked',
  'to be started': 'To Be Started', 'not started': 'To Be Started',
  'pending': 'To Be Started', 'open': 'To Be Started', 'to do': 'To Be Started',
}
function mapStatus(s) { return s ? (STATUS_MAP[s.toLowerCase().trim()] || 'To Be Started') : 'To Be Started' }

function flexibleParseDate(str) {
  if (!str) return null
  const s = str.trim()
  if (!s) return null

  // Common spreadsheet formats
  const formats = [
    'yyyy-MM-dd',
    'dd-MM-yyyy',
    'MM-dd-yyyy',
    'dd/MM/yyyy',
    'MM/dd/yyyy',
    'MMM d, yyyy',
    'MMMM d, yyyy',
    'yyyy/MM/dd',
    'd-M-yyyy',
    'M-d-yyyy',
    'd/M/yyyy',
    'M/d/yyyy'
  ]

  for (const f of formats) {
    try {
      const d = parse(s, f, new Date())
      if (isValid(d)) return format(d, 'yyyy-MM-dd')
    } catch (e) { }
  }

  const native = new Date(s)
  if (!isNaN(native.getTime())) return format(native, 'yyyy-MM-dd')

  return null
}

function parseCSV(text) {
  if (!text || !text.trim()) return null
  const lines = safeArray(text.split(/\r?\n/).filter(l => l.trim()))
  if (lines.length < 2) return null
  const sep = text.includes('\t') ? '\t' : ','
  // Clean headers: lower, no quotes, no extra spaces
  const headers = safeArray(lines[0]?.split(sep)).map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase())
  if (headers.length === 0) return null

  const rows = safeArray(lines.slice(1)).map(line => {
    const vals = safeArray(line?.split(sep)).map(v => v.trim().replace(/^["']|["']$/g, ''))
    return Object.fromEntries(safeArray(headers).map((h, i) => [h, vals[i] || '']))
  }).filter(r => Object.values(r).some(v => v))
  return { headers, rows }
}

function rowToTask(row, headers, clientId) {
  const h = (keywords) => headers.find(h => keywords.some(k => h.includes(k))) || ''
  const titleField = h(['to-do', 'todo', 'task', 'title', 'name', 'action item', 'item', 'description']) || headers[0]

  return {
    client_id: clientId,
    title: row[titleField] || '',
    status: mapStatus(row[h(['status'])] || ''),
    category: row[h(['category', 'type', 'group', 'industry'])] || 'Other',
    duration_days: row[h(['duration', 'days', 'effort', 'time'])] || '',
    remarks: row[h(['remark', 'note', 'comment', 'detail', 'feedback'])] || '',
    eta_end: flexibleParseDate(row[h(['eta', 'due', 'deadline', 'date', 'timeline', 'completion'])]),
    priority: 'P2',
  }
}

// ────────── CLICKUP HELPERS ──────────
const CU_STATUS_MAP = {
  'to do': 'To Be Started', 'open': 'To Be Started', 'not started': 'To Be Started',
  'in progress': 'In Progress', 'active': 'In Progress', 'in review': 'To Be Approved',
  'review': 'To Be Approved', 'approval': 'To Be Approved',
  'complete': 'Completed', 'done': 'Completed', 'closed': 'Completed',
  'blocked': 'Blocked', 'on hold': 'Blocked',
  'recurring': 'Recurring',
}
function mapCUStatus(s) { return CU_STATUS_MAP[s?.toLowerCase()?.trim()] || 'To Be Started' }

export default function ImportPage() {
  const { data: clientsData } = useSWR('/api/clients', swrFetcher)
  const { data: membersData } = useSWR('/api/team', swrFetcher)

  const clients = Array.isArray(clientsData) ? clientsData : []
  const members = Array.isArray(membersData) ? membersData : []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import</h1>
        <p className="text-gray-500 text-sm mt-1">Import tasks from CSV files or ClickUp</p>
      </div>
      <Tabs defaultValue="csv">
        <TabsList className="mb-6">
          <TabsTrigger value="csv">CSV / Google Sheets</TabsTrigger>
          <TabsTrigger value="clickup">ClickUp</TabsTrigger>
        </TabsList>
        <TabsContent value="csv">
          <CSVImport clients={clients} />
        </TabsContent>
        <TabsContent value="clickup">
          <ClickUpImport clients={clients} members={members} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── CSV IMPORT ───────────────────────────────────────────────────────────────
function CSVImport({ clients }) {
  const [selectedClient, setSelectedClient] = useState('__none__')
  const [rawData, setRawData] = useState('')
  const [parsed, setParsed] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [pasteMode, setPasteMode] = useState(false)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    setRawData(text)
    const p = parseCSV(text)
    if (p && p.rows.length > 0) {
      const sample = rowToTask(p.rows[0], p.headers, selectedClient)
      if (!sample.title) p.unsupported = true
    }
    setParsed(p)
  }

  const handlePaste = () => {
    const p = parseCSV(rawData)
    if (p && p.rows.length > 0) {
      const sample = rowToTask(p.rows[0], p.headers, selectedClient)
      if (!sample.title) p.unsupported = true
    }
    setParsed(p)
  }

  const handleImport = async () => {
    if (!parsed || !selectedClient || selectedClient === '__none__') return
    setImporting(true)
    setResult(null)

    // 1. Prepare tasks
    const tasks = safeArray(parsed?.rows).map(row => rowToTask(row, parsed.headers, selectedClient))

    // 2. Pre-filter locally for robustness
    const validTasks = tasks.filter(t => t.title && t.title.trim())
    const localSkipped = tasks.length - validTasks.length

    if (validTasks.length === 0) {
      setResult({ success: 0, failed: tasks.length, total: tasks.length, error: 'No valid tasks found. Please ensure your table has a "Task" or "Title" column.' })
      setImporting(false)
      return
    }

    try {
      const res = await apiFetch('/api/tasks/bulk', {
        method: 'POST',
        body: JSON.stringify({ tasks: validTasks, client_id: selectedClient })
      })
      const data = await res.json()

      if (res.ok) {
        setResult({
          success: data.count,
          failed: (data.failed || 0) + localSkipped,
          total: tasks.length,
          errors: data.errors || []
        })
        setParsed(null)
        setRawData('')
      } else {
        setResult({
          success: 0,
          failed: tasks.length,
          total: tasks.length,
          error: data.error || 'Export failed at server level'
        })
      }
    } catch (e) {
      setResult({ success: 0, failed: tasks.length, total: tasks.length, error: 'Network error during bulk import' })
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border border-gray-200">
        <CardHeader><CardTitle className="text-base">Upload CSV or Paste from Sheets</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {result && (
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              {result.error ? <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" /> : <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />}
              <div className="flex-1">
                {result.error ? (
                  <p className="text-sm font-medium text-red-700">{result.error}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-green-800">{result.success} tasks imported</p>
                    {result.failed > 0 && <p className="text-xs text-red-500">{result.failed} rows skipped/failed</p>}
                  </>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => setResult(null)} className="ml-auto text-xs">Clear</Button>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Target Client *</label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select a client…</SelectItem>
                {safeArray(clients).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant={!pasteMode ? 'default' : 'outline'} onClick={() => setPasteMode(false)}>Upload CSV</Button>
            <Button size="sm" variant={pasteMode ? 'default' : 'outline'} onClick={() => setPasteMode(true)}>Paste from Sheets</Button>
          </div>
          {parsed?.unsupported && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-[10px] leading-tight">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500" />
              <div>
                <p className="font-bold uppercase tracking-wider mb-0.5">Note on Formatting</p>
                <p>We couldn't clearly identify a "Task" or "Title" column. We'll use the first column as the title. For best results, use a "Task Name" header.</p>
              </div>
            </div>
          )}
          {!pasteMode ? (
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload className="w-7 h-7 text-gray-300 mb-1" />
              <span className="text-sm text-gray-400">Click to upload .csv or .tsv</span>
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFile} />
            </label>
          ) : (
            <div className="space-y-2">
              <textarea value={rawData} onChange={e => setRawData(e.target.value)} placeholder="Paste tab-separated data from Google Sheets here..." className="w-full h-36 p-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono resize-none" />
              <Button size="sm" onClick={handlePaste} disabled={!rawData.trim()}>Parse</Button>
            </div>
          )}
          {parsed && (
            <Button className="w-full" onClick={handleImport} disabled={importing || selectedClient === '__none__'}>
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : `Import ${parsed.rows.length} Tasks`}
            </Button>
          )}
        </CardContent>
      </Card>

      {parsed ? (
        <Card className="border border-gray-200">
          <CardHeader><CardTitle className="text-base">Preview <span className="text-xs font-normal text-gray-400">(first 10 rows)</span></CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-72">
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 border-b">{safeArray(parsed?.headers).map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 capitalize">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {safeArray(parsed?.rows?.slice(0, 10)).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {safeArray(parsed?.headers).map(h => <td key={h} className="px-3 py-1.5 text-gray-700 max-w-[100px] truncate">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-gray-100 bg-gray-50">
          <CardHeader><CardTitle className="text-sm text-gray-500">Supported Formats</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs text-gray-500">
            <div><p className="font-medium text-gray-700 mb-1">Format A (Behno style):</p><code className="bg-white border border-gray-200 rounded px-2 py-1 block">To-dos, Duration, Status, ETA, Remarks</code></div>
            <div><p className="font-medium text-gray-700 mb-1">Format B (Warehouse style):</p><code className="bg-white border border-gray-200 rounded px-2 py-1 block">Category, Task, Status, Notes</code></div>
            <div><p className="font-medium text-gray-700 mb-1">Status auto-mapping:</p><ul className="space-y-0.5"><li>"Work in Progress" → <span className="text-blue-600">In Progress</span></li><li>"Implemented/Completed" → <span className="text-green-600">Completed</span></li><li>"To Be Approved" → <span className="text-amber-600">To Be Approved</span></li></ul></div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── CLICKUP IMPORT ───────────────────────────────────────────────────────────
function ClickUpImport({ clients, members }) {
  const [apiToken, setApiToken] = useState('')
  const [tokenSaved, setTokenSaved] = useState(false)
  const [workspaces, setWorkspaces] = useState([])
  const [selectedWS, setSelectedWS] = useState('__none__')
  const [spaces, setSpaces] = useState([])
  const [lists, setLists] = useState([])
  const [selectedLists, setSelectedLists] = useState([])
  const [selectedClient, setSelectedClient] = useState('__none__')
  const [loadingWS, setLoadingWS] = useState(false)
  const [loadingLists, setLoadingLists] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importLog, setImportLog] = useState([])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const log = (msg) => setImportLog(l => [...l, msg])

  const fetchWorkspaces = async () => {
    if (!apiToken.trim()) { setError('Please enter your ClickUp API token'); return }
    setError('')
    setLoadingWS(true)
    const res = await apiFetch('/api/clickup/workspaces', {
      method: 'POST',
      body: JSON.stringify({ token: apiToken })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to fetch workspaces'); setLoadingWS(false); return }
    setWorkspaces(data.workspaces || [])
    setTokenSaved(true)
    setLoadingWS(false)
  }

  const fetchLists = async (wsId) => {
    setSelectedWS(wsId)
    setLists([])
    setSelectedLists([])
    if (wsId === '__none__') return
    setLoadingLists(true)
    const res = await apiFetch('/api/clickup/lists', {
      method: 'POST',
      body: JSON.stringify({ token: apiToken, workspace_id: wsId })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to fetch lists'); setLoadingLists(false); return }
    setLists(data.lists || [])
    setLoadingLists(false)
  }

  const toggleList = (id) => setSelectedLists(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const runImport = async () => {
    if (selectedLists.length === 0 || selectedClient === '__none__') return
    setImporting(true)
    setResult(null)
    setImportLog([])
    log(`Starting import of ${selectedLists.length} list(s)...`)

    const res = await apiFetch('/api/clickup/import', {
      method: 'POST',
      body: JSON.stringify({
        token: apiToken,
        list_ids: selectedLists,
        client_id: selectedClient,
        members
      })
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Import failed')
      setImporting(false)
      return
    }
    setResult(data)
    log(`✅ Done! ${data.imported} tasks imported, ${data.skipped} skipped.`)
    setImporting(false)
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      {result && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-gray-900">Import Complete!</p>
            <p className="text-sm text-gray-600">{result.imported} tasks imported · {result.skipped} already existed</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setResult(null); setSelectedLists([]) }} className="ml-auto">Import More</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Step 1: Token */}
        <Card className="border border-gray-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" /> Step 1: ClickUp API Token</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">Get your token: ClickUp → <b>Settings</b> → <b>Apps</b> → <b>API Token</b></p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiToken}
                onChange={e => { setApiToken(e.target.value); setTokenSaved(false); setWorkspaces([]); setLists([]) }}
                placeholder="pk_xxxxxxxxxxxxxxxxxxxx"
                className="font-mono text-sm"
              />
              <Button onClick={fetchWorkspaces} disabled={loadingWS || !apiToken.trim()} className="flex-shrink-0">
                {loadingWS ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
              </Button>
            </div>
            {tokenSaved && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Connected — {workspaces.length} workspace(s) found</p>}
          </CardContent>
        </Card>

        {/* Step 2: Workspace + Lists */}
        <Card className={`border ${!tokenSaved ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
          <CardHeader><CardTitle className="text-base">Step 2: Select Workspace &amp; Lists</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={selectedWS} onValueChange={fetchLists} disabled={!tokenSaved}>
              <SelectTrigger><SelectValue placeholder="Choose workspace" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Choose workspace…</SelectItem>
                {safeArray(workspaces).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {loadingLists && <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin" /> Fetching lists...</div>}

            {lists.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Select lists to import ({selectedLists.length} selected):</p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {safeArray(lists).map(l => (
                    <label key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedLists.includes(l.id)}
                        onChange={() => toggleList(l.id)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">{l?.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{l?.space_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Target Client */}
        <Card className={`border ${selectedLists.length === 0 ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
          <CardHeader><CardTitle className="text-base">Step 3: Map to Client</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500 mb-3">Which client should these tasks be imported into?</p>
            <Select value={selectedClient} onValueChange={setSelectedClient} disabled={selectedLists.length === 0}>
              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select client…</SelectItem>
                {safeArray(clients).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Step 4: Import */}
        <Card className={`border ${(selectedLists.length === 0 || selectedClient === '__none__') ? 'border-gray-100 opacity-60' : 'border-blue-200 bg-blue-50'}`}>
          <CardHeader><CardTitle className="text-base">Step 4: Run Import</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">{selectedLists.length} list(s) → {clients.find(c => c.id === selectedClient)?.name || '—'}</p>
            <Button
              className="w-full"
              onClick={runImport}
              disabled={importing || selectedLists.length === 0 || selectedClient === '__none__'}
            >
              {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing from ClickUp...</> : 'Start Import'}
            </Button>
            {importLog.length > 0 && (
              <div className="bg-gray-900 rounded p-3 text-xs text-green-400 font-mono space-y-1 max-h-24 overflow-y-auto">
                {safeArray(importLog).map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
