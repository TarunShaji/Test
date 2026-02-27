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
import { Upload, CheckCircle, AlertCircle, Loader2, Key } from 'lucide-react'

// ────────── STATUS MAPPING ──────────
const STATUS_MAP = {
  'implemented/ completed': 'Completed', 'implemented/completed': 'Completed',
  'completed': 'Completed', 'complete': 'Completed', 'done': 'Completed', 'fixed': 'Completed',
  'work in progress': 'In Progress', 'in progress': 'In Progress', 'wip': 'In Progress',
  'to be approved': 'Pending Review', 'pending approval': 'Pending Review', 'in review': 'Pending Review',
  'recurring': 'Recurring', 'blocked': 'Blocked',
  'to be started': 'To Be Started', 'not started': 'To Be Started',
  'pending': 'To Be Started', 'open': 'To Be Started', 'to do': 'To Be Started',
}
function mapStatus(s) { return s ? (STATUS_MAP[s.toLowerCase().trim()] || 'To Be Started') : 'To Be Started' }

// ────────── DATE PARSING ──────────
function flexibleParseDate(str) {
  if (!str) return null
  const s = String(str).trim()
  if (!s) return null
  const formats = [
    'yyyy-MM-dd', 'dd-MM-yyyy', 'MM-dd-yyyy',
    'dd/MM/yyyy', 'MM/dd/yyyy', 'MMM d, yyyy',
    'MMMM d, yyyy', 'yyyy/MM/dd',
    'd-M-yyyy', 'M-d-yyyy', 'd/M/yyyy', 'M/d/yyyy',
    'd MMM yyyy', 'd MMMM yyyy',
  ]
  for (const f of formats) {
    try {
      const d = parse(s, f, new Date())
      if (isValid(d)) return format(d, 'yyyy-MM-dd')
    } catch (e) { /* continue */ }
  }
  const native = new Date(s)
  if (!isNaN(native.getTime())) return format(native, 'yyyy-MM-dd')
  return null
}

// ────────── ROBUST CSV PARSER ──────────
// Handles:
//   - Quoted fields with commas inside: "hello, world"
//   - Quoted fields with embedded newlines
//   - Tab-separated (Google Sheets paste)
//   - Mixed quote styles, leading/trailing whitespace
function parseCSV(text) {
  if (!text || !text.trim()) return null

  // Detect separator: prefer tab (Google Sheets) then comma
  const firstLine = text.split(/\r?\n/)[0] || ''
  const sep = firstLine.includes('\t') ? '\t' : ','

  /** Tokenize a full CSV record respecting RFC-4180 quoting */
  function tokenize(line, s) {
    const cells = []
    let i = 0
    while (i <= line.length) {
      if (line[i] === '"') {
        // Quoted cell
        let cell = ''
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            cell += '"'; i += 2
          } else if (line[i] === '"') {
            i++; break
          } else {
            cell += line[i++]
          }
        }
        cells.push(cell.trim())
        if (line[i] === s) i++ // skip separator after closing quote
      } else {
        // Unquoted cell
        const end = line.indexOf(s, i)
        if (end === -1) {
          cells.push(line.slice(i).trim())
          break
        } else {
          cells.push(line.slice(i, end).trim())
          i = end + 1
        }
      }
    }
    return cells
  }

  // Split lines, being careful not to split inside quoted fields
  function splitLines(raw) {
    const lines = []
    let current = ''
    let inQuote = false
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (ch === '"') inQuote = !inQuote
      if ((ch === '\n' || (ch === '\r' && raw[i + 1] === '\n')) && !inQuote) {
        if (ch === '\r') i++ // skip \n after \r
        if (current.trim()) lines.push(current)
        current = ''
      } else {
        current += ch
      }
    }
    if (current.trim()) lines.push(current)
    return lines
  }

  const lines = splitLines(text)
  if (lines.length < 2) return null

  const headers = tokenize(lines[0], sep)
    .map(h => h.replace(/^["']|["']$/g, '').toLowerCase().trim())
    .filter(h => h)

  if (headers.length === 0) return null

  const rows = lines.slice(1)
    .map(line => {
      const vals = tokenize(line, sep)
      const obj = {}
      headers.forEach((h, i) => {
        obj[h] = (vals[i] || '').replace(/^["']|["']$/g, '').trim()
      })
      return obj
    })
    .filter(r => Object.values(r).some(v => v && v.toString().trim()))

  return { headers, rows }
}

// ────────── ROW → TASK ──────────
function rowToTask(row, headers, clientId) {
  if (!row || !headers || !clientId) return null
  const h = (kws) => headers.find(hdr => kws.some(k => hdr.includes(k))) || ''
  const titleField = h(['to-do', 'todo', 'task', 'title', 'name', 'action item', 'item', 'description']) || headers[0]
  const title = (row[titleField] || '').trim()
  if (!title) return null  // skip empty rows
  return {
    client_id: clientId,
    title,
    status: mapStatus(row[h(['status'])] || ''),
    category: row[h(['category', 'type', 'group', 'industry'])] || 'Other',
    duration_days: row[h(['duration', 'days', 'effort', 'time'])] || '',
    remarks: row[h(['remark', 'note', 'comment', 'detail', 'feedback'])] || '',
    eta_end: flexibleParseDate(row[h(['eta', 'due', 'deadline', 'date', 'timeline', 'completion'])]),
    priority: 'P2',
  }
}

// ────────── CLICKUP STATUS MAPPING ──────────
const CU_STATUS_MAP = {
  'to do': 'To Be Started', 'open': 'To Be Started', 'not started': 'To Be Started',
  'in progress': 'In Progress', 'active': 'In Progress', 'in review': 'Pending Review',
  'review': 'Pending Review', 'approval': 'Pending Review',
  'complete': 'Completed', 'done': 'Completed', 'closed': 'Completed',
  'blocked': 'Blocked', 'on hold': 'Blocked', 'recurring': 'Recurring',
}
function mapCUStatus(s) { return CU_STATUS_MAP[s?.toLowerCase()?.trim()] || 'To Be Started' }

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────
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
  const [parseError, setParseError] = useState('')

  const doParse = (text) => {
    setParseError('')
    try {
      const p = parseCSV(text)
      if (!p) {
        setParseError('Could not parse the data. Make sure it has at least a header row and one data row.')
        setParsed(null)
        return
      }
      const validRows = p.rows.filter(r => {
        const h = (kws) => p.headers.find(hdr => kws.some(k => hdr.includes(k))) || p.headers[0]
        const titleField = h(['to-do', 'todo', 'task', 'title', 'name', 'action item', 'item', 'description'])
        return (r[titleField] || r[p.headers[0]] || '').trim()
      })
      if (validRows.length === 0) {
        p.unsupported = true
      }
      setParsed(p)
    } catch (e) {
      setParseError('Error parsing data: ' + (e?.message || 'Unknown error'))
      setParsed(null)
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ''
    try {
      const text = await file.text()
      setRawData(text)
      doParse(text)
    } catch (e) {
      setParseError('Failed to read file: ' + (e?.message || 'Unknown error'))
    }
  }

  const handleImport = async () => {
    if (!parsed || !selectedClient || selectedClient === '__none__') return
    setImporting(true)
    setResult(null)

    let tasks = []
    try {
      tasks = safeArray(parsed?.rows)
        .map(row => rowToTask(row, parsed.headers, selectedClient))
        .filter(Boolean)
    } catch (e) {
      setResult({ success: 0, failed: 0, total: 0, error: 'Failed to process rows: ' + (e?.message || '') })
      setImporting(false)
      return
    }

    if (tasks.length === 0) {
      setResult({ success: 0, failed: parsed.rows.length, total: parsed.rows.length, error: 'No valid tasks found. Ensure your table has a "Task" or "Title" column.' })
      setImporting(false)
      return
    }

    try {
      const res = await apiFetch('/api/tasks/bulk', {
        method: 'POST',
        body: JSON.stringify({ tasks, client_id: selectedClient })
      })

      let data = {}
      try { data = await res.json() } catch (e) { /* non-JSON response */ }

      if (res.ok) {
        setResult({
          success: data.count ?? tasks.length,
          failed: data.failed ?? 0,
          total: tasks.length,
          errors: safeArray(data.errors)
        })
        setParsed(null)
        setRawData('')
      } else {
        setResult({
          success: 0,
          failed: tasks.length,
          total: tasks.length,
          error: data.error || `Server error (${res.status})`
        })
      }
    } catch (e) {
      setResult({ success: 0, failed: tasks.length, total: tasks.length, error: 'Network error: ' + (e?.message || 'Could not reach server') })
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
            <div className={`flex items-start gap-3 p-3 rounded-lg border ${result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              {result.error
                ? <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                : <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              }
              <div className="flex-1">
                {result.error
                  ? <p className="text-sm font-medium text-red-700">{result.error}</p>
                  : <>
                    <p className="text-sm font-medium text-green-800">{result.success} tasks imported successfully</p>
                    {result.failed > 0 && <p className="text-xs text-red-500 mt-0.5">{result.failed} rows skipped (empty title or invalid)</p>}
                  </>
                }
              </div>
              <Button size="sm" variant="outline" onClick={() => setResult(null)} className="ml-auto text-xs flex-shrink-0">Clear</Button>
            </div>
          )}
          {parseError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{parseError}</p>
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
                <p className="font-bold uppercase tracking-wider mb-0.5">Note on Column Names</p>
                <p>Couldn't find a clear "Task" or "Title" column. Using the first column as title. Consider renaming your column to "Task Name" for best results.</p>
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
              <textarea
                value={rawData}
                onChange={e => setRawData(e.target.value)}
                placeholder="Paste tab-separated data from Google Sheets here..."
                className="w-full h-36 p-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono resize-none"
              />
              <Button size="sm" onClick={() => doParse(rawData)} disabled={!rawData.trim()}>Parse</Button>
            </div>
          )}
          {parsed && (
            <Button
              className="w-full"
              onClick={handleImport}
              disabled={importing || selectedClient === '__none__'}
            >
              {importing
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                : `Import ${parsed.rows.filter(r => {
                  const t = parsed.headers.find(h => ['task', 'title', 'to-do', 'todo', 'name', 'action item', 'item'].some(k => h.includes(k))) || parsed.headers[0]
                  return (r[t] || '').trim()
                }).length} Tasks`
              }
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
            <div><p className="font-medium text-gray-700 mb-1">Format A:</p><code className="bg-white border border-gray-200 rounded px-2 py-1 block">To-dos, Duration, Status, ETA, Remarks</code></div>
            <div><p className="font-medium text-gray-700 mb-1">Format B:</p><code className="bg-white border border-gray-200 rounded px-2 py-1 block">Category, Task, Status, Notes</code></div>
            <div>
              <p className="font-medium text-gray-700 mb-1">Status auto-mapping:</p>
              <ul className="space-y-0.5">
                <li>"Work in Progress" → <span className="text-blue-600">In Progress</span></li>
                <li>"Implemented/Completed" → <span className="text-green-600">Completed</span></li>
                <li>"In Review" → <span className="text-amber-600">Pending Review</span></li>
              </ul>
            </div>
            <div><p className="font-medium text-gray-700 mb-1">Paste from Google Sheets:</p><p>Select your sheet cells → Copy → Paste here. Tab-separated data is handled automatically.</p></div>
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
    try {
      const res = await apiFetch('/api/clickup/workspaces', {
        method: 'POST',
        body: JSON.stringify({ token: apiToken })
      })
      let data = {}
      try { data = await res.json() } catch (e) { /* ignore */ }
      if (!res.ok) { setError(data.error || 'Failed to fetch workspaces'); return }
      setWorkspaces(safeArray(data.workspaces))
      setTokenSaved(true)
    } catch (e) {
      setError('Network error: ' + (e?.message || 'Could not connect'))
    } finally {
      setLoadingWS(false)
    }
  }

  const fetchLists = async (wsId) => {
    setSelectedWS(wsId)
    setLists([])
    setSelectedLists([])
    if (wsId === '__none__') return
    setLoadingLists(true)
    try {
      const res = await apiFetch('/api/clickup/lists', {
        method: 'POST',
        body: JSON.stringify({ token: apiToken, workspace_id: wsId })
      })
      let data = {}
      try { data = await res.json() } catch (e) { /* ignore */ }
      if (!res.ok) { setError(data.error || 'Failed to fetch lists'); return }
      setLists(safeArray(data.lists))
    } catch (e) {
      setError('Network error: ' + (e?.message || 'Could not fetch lists'))
    } finally {
      setLoadingLists(false)
    }
  }

  const toggleList = (id) => setSelectedLists(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const runImport = async () => {
    if (selectedLists.length === 0 || selectedClient === '__none__') return
    setImporting(true)
    setResult(null)
    setImportLog([])
    setError('')
    log(`Starting import of ${selectedLists.length} list(s)...`)

    try {
      const res = await apiFetch('/api/clickup/import', {
        method: 'POST',
        body: JSON.stringify({ token: apiToken, list_ids: selectedLists, client_id: selectedClient, members })
      })
      let data = {}
      try { data = await res.json() } catch (e) { /* ignore */ }
      if (!res.ok) {
        setError(data.error || 'Import failed')
        return
      }
      setResult(data)
      log(`✅ Done! ${data.imported ?? 0} tasks imported, ${data.skipped ?? 0} skipped.`)
    } catch (e) {
      setError('Network error: ' + (e?.message || 'Could not complete import'))
      log('❌ Import failed: ' + (e?.message || ''))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600 text-xs underline">Dismiss</button>
        </div>
      )}

      {result && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-semibold text-gray-900">Import Complete!</p>
            <p className="text-sm text-gray-600">{result.imported ?? 0} tasks imported · {result.skipped ?? 0} already existed</p>
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
                      <input type="checkbox" checked={selectedLists.includes(l.id)} onChange={() => toggleList(l.id)} className="rounded" />
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
