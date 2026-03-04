'use client'
import { useState } from 'react'
import useSWR from 'swr'
import { apiFetch, swrFetcher } from '@/lib/middleware/auth'
import { safeArray } from '@/lib/safe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, CheckCircle, AlertCircle, Loader2, Key, FileText, ListTodo } from 'lucide-react'
import { rowToContent, getMappedHeaders } from '@/lib/import/content-mapping'
import { rowToTask, rowToClickUpTask, TASK_PREVIEW_COLS } from '@/lib/import/task-mapping'


function parseSpreadsheet(text) {
  if (!text || !text.trim()) return null

  const firstLine = text.split(/\r?\n/)[0] || ''
  const sep = firstLine.includes('\t') ? '\t' : ','

  function splitLines(raw) {
    const lines = []
    let cur = '', inQ = false
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (ch === '"') inQ = !inQ
      if ((ch === '\n' || (ch === '\r' && raw[i + 1] === '\n')) && !inQ) {
        if (ch === '\r') i++
        if (cur.trim()) lines.push(cur)
        cur = ''
      } else { cur += ch }
    }
    if (cur.trim()) lines.push(cur)
    return lines
  }

  function tokenize(line, s) {
    const cells = []
    let i = 0
    while (i <= line.length) {
      if (line[i] === '"') {
        let cell = ''; i++
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { cell += '"'; i += 2 }
          else if (line[i] === '"') { i++; break }
          else { cell += line[i++] }
        }
        cells.push(cell.trim())
        if (line[i] === s) i++
      } else {
        const end = line.indexOf(s, i)
        if (end === -1) { cells.push(line.slice(i).trim()); break }
        else { cells.push(line.slice(i, end).trim()); i = end + 1 }
      }
    }
    return cells
  }

  const lines = splitLines(text)
  if (lines.length < 2) return null

  const rawHeaders = tokenize(lines[0], sep)
  const headers = rawHeaders.map(h => h.replace(/^["']|["']$/g, '').trim())
  const validHeaders = headers.filter(h => h)
  if (validHeaders.length === 0) return null

  const rows = lines.slice(1).map(line => {
    const vals = tokenize(line, sep)
    const obj = {}
    headers.forEach((h, i) => {
      if (h) obj[h] = (vals[i] || '').replace(/^["']|["']$/g, '').trim()
    })
    return obj
  }).filter(r => Object.values(r).some(v => v && String(v).trim()))

  return { headers: validHeaders, rows }
}


// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ImportPage() {
  const { data: clientsData } = useSWR('/api/clients', swrFetcher)
  const { data: membersData } = useSWR('/api/team', swrFetcher)

  const clients = Array.isArray(clientsData) ? clientsData : []
  const members = Array.isArray(membersData) ? membersData : []

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import</h1>
        <p className="text-gray-500 text-sm mt-1">Import tasks or content calendar items from CSV / Google Sheets, or from ClickUp</p>
      </div>
      <Tabs defaultValue="tasks-csv">
        <TabsList className="mb-6">
          <TabsTrigger value="tasks-csv" className="flex items-center gap-1.5"><ListTodo className="w-3.5 h-3.5" />Tasks — CSV</TabsTrigger>
          <TabsTrigger value="content-csv" className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Content Calendar — CSV</TabsTrigger>
          <TabsTrigger value="clickup-csv" className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5" />ClickUp CSV</TabsTrigger>
          <TabsTrigger value="clickup" className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5" />ClickUp API</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks-csv">
          <TaskCSVImport clients={clients} />
        </TabsContent>

        <TabsContent value="content-csv">
          <ContentCSVImport clients={clients} />
        </TabsContent>

        <TabsContent value="clickup-csv">
          <ClickUpCSVImport clients={clients} />
        </TabsContent>

        <TabsContent value="clickup">
          <ClickUpImport clients={clients} members={members} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED IMPORT UI SHELL
// ═══════════════════════════════════════════════════════════════════════════════

function ImportShell({
  title, hint, clients, selectedClient, setSelectedClient,
  rawData, setRawData, parsed, parseError,
  onFile, onParse, onImport,
  importing, result, setResult,
  previewCols,
  actionLabel,
  customPreview,
}) {
  const [pasteMode, setPasteMode] = useState(false)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: controls */}
      <Card className="border border-gray-200">
        <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {result && (
            <div className={`flex items-start gap-3 p-3 rounded-lg border ${result.error ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              {result.error
                ? <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                : <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                {result.error
                  ? <p className="text-sm font-medium text-red-700">{result.error}</p>
                  : <>
                    <p className="text-sm font-medium text-green-800">{result.success} {actionLabel} imported successfully</p>
                    {result.failed > 0 && <p className="text-xs text-red-500 mt-0.5">{result.failed} rows skipped (missing required fields)</p>}
                    {safeArray(result.errors).slice(0, 3).map((e, i) => (
                      <p key={i} className="text-xs text-red-400 mt-0.5 truncate">{String(e.title ?? (e.index != null ? `Row ${e.index + 1}` : 'Error'))}: {String(e.error ?? e)}</p>
                    ))}
                  </>}
              </div>
              <Button size="sm" variant="outline" onClick={() => setResult(null)} className="ml-auto flex-shrink-0 text-xs">Clear</Button>
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
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-[10px] leading-tight">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="font-bold uppercase tracking-wider mb-0.5">Column Mapping Warning</p>
                <p>{parsed.unsupportedMsg || 'Some rows may not map correctly. Check the preview and ensure key columns are present.'}</p>
              </div>
            </div>
          )}
          {hint && !parsed && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">{hint}</div>
          )}
          {!pasteMode ? (
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <Upload className="w-7 h-7 text-gray-300 mb-1" />
              <span className="text-sm text-gray-400">Click to upload .csv or .tsv</span>
              <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFile} />
            </label>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rawData}
                onChange={e => setRawData(e.target.value)}
                onPaste={e => {
                  const html = e.clipboardData.getData('text/html')
                  if (!html || !html.includes('<a ')) return

                  e.preventDefault()
                  try {
                    const parser = new DOMParser()
                    const doc = parser.parseFromString(html, 'text/html')
                    const table = doc.querySelector('table')
                    if (!table) {
                      // Just plain HTML with links, manually fallback or use text
                      const text = e.clipboardData.getData('text/plain')
                      setRawData(text)
                      return
                    }

                    const rows = Array.from(table.querySelectorAll('tr'))
                    const tsv = rows.map(tr => {
                      const cells = Array.from(tr.querySelectorAll('td, th'))
                      return cells.map(td => {
                        const link = td.querySelector('a')
                        const text = (td.innerText || td.textContent || '').trim()
                        // If the cell is a hyperlink, prefer the href URL directly.
                        // This makes the URL visible and clickable in the textarea.
                        // The import mapping still extracts URLs via regex as a fallback.
                        if (link && link.href && link.href.startsWith('http')) {
                          return link.href
                        }
                        return text
                      }).join('\t')
                    }).join('\n')

                    setRawData(tsv)
                    // Trigger parse immediately. Pass tsv directly to avoid stale state from setRawData
                    setTimeout(() => onParse(tsv), 10)
                  } catch (err) {
                    console.error('Paste intercept failed', err)
                    const text = e.clipboardData.getData('text/plain')
                    setRawData(text)
                  }
                }}
                placeholder="Paste tab-separated data from Google Sheets here..."
                className="w-full h-36 p-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono resize-none"
              />
              <Button size="sm" onClick={() => onParse(rawData)} disabled={!rawData.trim()}>Parse</Button>
            </div>
          )}
          {parsed && (
            <Button
              className="w-full"
              onClick={onImport}
              disabled={importing || selectedClient === '__none__'}
            >
              {importing
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</>
                : `Import ${parsed.validCount ?? parsed.rows.length} ${actionLabel}`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Right: preview / format guide */}
      {customPreview ? customPreview : parsed ? (
        <Card className="border border-gray-200">
          <CardHeader>
            <CardTitle className="text-base">
              Preview <span className="text-xs font-normal text-gray-400">(first 8 rows · {parsed.rows.length} total)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {safeArray(parsed.headers).slice(0, previewCols ?? 8).map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {safeArray(parsed.rows.slice(0, 8)).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {safeArray(parsed.headers).slice(0, previewCols ?? 8).map(h => (
                        <td key={h} className="px-3 py-1.5 text-gray-700 max-w-[120px] truncate">{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
              <span className="font-medium">{parsed.validCount ?? parsed.rows.length}</span> valid rows
            </div>
          </CardContent>
        </Card>
      ) : (
        <FormatGuide actionLabel={actionLabel} />
      )}
    </div>
  )
}

function FormatGuide({ actionLabel }) {
  if (actionLabel === 'tasks') return (
    <Card className="border border-gray-100 bg-gray-50">
      <CardHeader><CardTitle className="text-sm text-gray-500">Detected Columns</CardTitle></CardHeader>
      <CardContent className="text-xs text-gray-500 space-y-3">
        <div>
          <p className="font-semibold text-gray-700 mb-1">Required</p>
          <p className="text-gray-600">Task / Task Name / Task Title / Title / Name / To-do / Todo / Action Item / Action Items / Item / Description / Deliverable</p>
        </div>
        <div>
          <p className="font-semibold text-gray-700 mb-1">Optional (auto-detected)</p>
          <ul className="space-y-0.5">
            <li><span className="font-medium">Status</span> → Work in Progress, Completed, Pending Review, Blocked… (case-insensitive)</li>
            <li><span className="font-medium">Category / Type / Group / Service / Industry</span> — saved as plain text</li>
            <li><span className="font-medium">Priority</span> → P0/Urgent, P1/High, P2/Normal (default), P3/Low</li>
            <li><span className="font-medium">ETA / Due / Deadline / Required by / Timeline</span></li>
            <li><span className="font-medium">Link / URL / Live Link</span></li>
          </ul>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded p-2 text-blue-700">
          <strong>Assigned To</strong> is not mapped — select the assignee from the dashboard after import.
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded p-2 text-amber-700">
          Rows are skipped only when the Task/Title column cannot be found. Unknown columns are logged but not imported.
        </div>
      </CardContent>
    </Card>
  )

  return (
    <Card className="border border-gray-100 bg-gray-50">
      <CardHeader><CardTitle className="text-sm text-gray-500">Detected Columns</CardTitle></CardHeader>
      <CardContent className="text-xs text-gray-500 space-y-3">
        <div>
          <p className="font-semibold text-gray-700 mb-1">Required</p>
          <p className="text-gray-600">Blog Title / Blog Topic / Title / Topic</p>
        </div>
        <div>
          <p className="font-semibold text-gray-700 mb-1">Optional (auto-detected)</p>
          <ul className="space-y-0.5">
            <li><span className="font-medium">Week / Wk</span> — kept as number 1–10</li>
            <li><span className="font-medium">Keyword / Primary Keyword / Primary Keywords</span></li>
            <li><span className="font-medium">Writer / Author</span></li>
            <li><span className="font-medium">Blog Doc / Blog Document / Blog</span></li>
            <li><span className="font-medium">Blog Link / Link / Published Link / Publishing Link</span></li>
            <li><span className="font-medium">Published / Published Date / Date of Publication</span> → normalised to YYYY-MM-DD</li>
            <li><span className="font-medium">Topic Approval / Topic Status</span> → Pending, Approved, Rejected</li>
            <li><span className="font-medium">Blog Status</span> → Draft, In Progress, Sent, Published...</li>
            <li><span className="font-medium">Internal Approval / Blog Internal Approval</span> → Pending, Approved</li>
          </ul>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded p-2 text-blue-700">
          Client Approval and Feedback are <strong>not imported</strong> — managed via the dashboard after sending links.
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded p-2 text-amber-700">
          Rows are skipped only when the Blog Title column cannot be found.
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLICKUP CSV IMPORT — One-time, isolated, minimal 4-field mapping
// ═══════════════════════════════════════════════════════════════════════════════

const CLICKUP_PREVIEW_COLS = [
  { field: 'title', label: 'Task Name' },
  { field: 'status', label: 'Status' },
  { field: 'priority', label: 'Priority' },
  { field: 'eta_end', label: 'Date Updated (→ ETA)' },
]

function ClickUpCSVImport({ clients }) {
  const [selectedClient, setSelectedClient] = useState('__none__')
  const [rawData, setRawData] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mappedRows, setMappedRows] = useState([])
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const doParse = (text) => {
    setParseError('')
    try {
      const p = parseSpreadsheet(text)
      if (!p) { setParseError('Could not parse. Make sure there is a header row and at least one data row.'); setParsed(null); setMappedRows([]); return }
      const mapped = p.rows.map(r => rowToClickUpTask(r, p.headers, 'preview')).filter(Boolean)
      if (mapped.length === 0) {
        setParsed({ ...p, validCount: 0, unsupported: true, unsupportedMsg: 'No rows with a recognisable "Task Name" column found.' })
        setMappedRows([])
        return
      }
      setParsed({ ...p, validCount: mapped.length })
      setMappedRows(mapped)
    } catch (e) { setParseError('Parse error: ' + (e?.message || 'Unknown error')); setParsed(null); setMappedRows([]) }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try { const text = await file.text(); setRawData(text); doParse(text) }
    catch (e) { setParseError('Could not read file: ' + (e?.message || '')) }
  }

  const handleImport = async () => {
    if (!parsed || selectedClient === '__none__') return
    setImporting(true); setResult(null)
    const tasks = safeArray(parsed.rows).map(r => rowToClickUpTask(r, parsed.headers, selectedClient)).filter(Boolean)
    if (tasks.length === 0) {
      setResult({ success: 0, failed: parsed.rows.length, total: parsed.rows.length, error: 'No valid tasks found — ensure your CSV has a "Task Name" column.' })
      setImporting(false); return
    }
    try {
      const res = await apiFetch('/api/tasks/bulk', { method: 'POST', body: JSON.stringify({ tasks, client_id: selectedClient }) })
      let data = {}; try { data = await res.json() } catch (e) { /* ignore */ }
      if (res.ok) {
        setResult({ success: data.count ?? tasks.length, failed: data.failed ?? 0, total: tasks.length, errors: safeArray(data.errors) })
        setParsed(null); setMappedRows([]); setRawData('')
      } else { setResult({ success: 0, failed: tasks.length, total: tasks.length, error: data.error || `Server error (${res.status})` }) }
    } catch (e) { setResult({ success: 0, failed: 0, total: 0, error: 'Network error: ' + (e?.message || 'Could not reach server') }) }
    finally { setImporting(false) }
  }

  const mappedPreview = mappedRows.length > 0 && (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base">
          Preview <span className="text-xs font-normal text-gray-400">(exactly what will be saved · {mappedRows.length} rows)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                {CLICKUP_PREVIEW_COLS.map(c => (
                  <th key={c.field} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mappedRows.slice(0, 8).map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {CLICKUP_PREVIEW_COLS.map(c => (
                    <td key={c.field} className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate" title={row[c.field] || ''}>
                      {row[c.field] || <span className="text-gray-300 italic">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          <span className="font-medium">{mappedRows.length}</span> rows ready · Priorities mapped from ClickUp (URGENT→P0, HIGH→P1, NORMAL→P2, none→P3)
        </div>
      </CardContent>
    </Card>
  )

  return (
    <ImportShell
      title="Upload ClickUp CSV Export"
      hint={<span>Export from ClickUp → select columns: <b>Task Name, Status, Priority, Date Updated</b>. Other columns are ignored.</span>}
      actionLabel="tasks"
      clients={clients}
      selectedClient={selectedClient}
      setSelectedClient={setSelectedClient}
      rawData={rawData}
      setRawData={setRawData}
      parsed={parsed}
      parseError={parseError}
      onFile={handleFile}
      onParse={(text) => doParse(text || rawData)}
      onImport={handleImport}
      importing={importing}
      result={result}
      setResult={setResult}
      customPreview={mappedPreview}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK CSV IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

function TaskCSVImport({ clients }) {
  const [selectedClient, setSelectedClient] = useState('__none__')
  const [rawData, setRawData] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mappedRows, setMappedRows] = useState([])
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const doParse = (text) => {
    setParseError('')
    try {
      const p = parseSpreadsheet(text)
      if (!p) { setParseError('Could not parse. Make sure there is a header row and at least one data row.'); setParsed(null); setMappedRows([]); return }

      console.log('[task-import] 📋 Raw sheet columns:', p.headers)

      const mapped = p.rows.map(r => rowToTask(r, p.headers, 'preview')).filter(Boolean)
      console.log('[task-import] ✅ Mapped', mapped.length, 'of', p.rows.length, 'rows | Sample:', mapped[0])

      if (mapped.length === 0) {
        setParsed({ ...p, validCount: 0, unsupported: true, unsupportedMsg: 'No rows with a recognisable title column found. Rename your column to "Task", "Title", or "Name".' })
        setMappedRows([])
        return
      }

      setParsed({ ...p, validCount: mapped.length })
      setMappedRows(mapped)
    } catch (e) {
      console.error('[task-import] Parse error:', e)
      setParseError('Parse error: ' + (e?.message || 'Unknown error'))
      setParsed(null)
      setMappedRows([])
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try { const text = await file.text(); setRawData(text); doParse(text) }
    catch (e) { setParseError('Could not read file: ' + (e?.message || '')) }
  }

  const handleImport = async () => {
    if (!parsed || selectedClient === '__none__') return
    setImporting(true); setResult(null)
    const tasks = safeArray(parsed.rows).map(r => rowToTask(r, parsed.headers, selectedClient)).filter(Boolean)
    if (tasks.length === 0) {
      setResult({ success: 0, failed: parsed.rows.length, total: parsed.rows.length, error: 'No valid tasks found — ensure your spreadsheet has a title column.' })
      setImporting(false); return
    }
    try {
      const res = await apiFetch('/api/tasks/bulk', { method: 'POST', body: JSON.stringify({ tasks, client_id: selectedClient }) })
      let data = {}; try { data = await res.json() } catch (e) { /* ignore */ }
      if (res.ok) {
        setResult({ success: data.count ?? tasks.length, failed: data.failed ?? 0, total: tasks.length, errors: safeArray(data.errors) })
        setParsed(null); setMappedRows([]); setRawData('')
      } else { setResult({ success: 0, failed: tasks.length, total: tasks.length, error: data.error || `Server error (${res.status})` }) }
    } catch (e) { setResult({ success: 0, failed: 0, total: 0, error: 'Network error: ' + (e?.message || 'Could not reach server') }) }
    finally { setImporting(false) }
  }

  const mappedPreview = mappedRows.length > 0 && (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base">
          Preview <span className="text-xs font-normal text-gray-400">(exactly what will be saved · {mappedRows.length} rows)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                {TASK_PREVIEW_COLS.map(c => (
                  <th key={c.field} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mappedRows.slice(0, 8).map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {TASK_PREVIEW_COLS.map(c => (
                    <td key={c.field} className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate" title={String(row[c.field] || '')}>
                      {String(row[c.field] ?? '') || <span className="text-gray-300 italic">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          <span className="font-medium">{mappedRows.length}</span> rows ready to import
        </div>
      </CardContent>
    </Card>
  )

  return (
    <ImportShell
      title="Upload Tasks CSV or Paste from Sheets"
      actionLabel="tasks"
      clients={clients}
      selectedClient={selectedClient}
      setSelectedClient={setSelectedClient}
      rawData={rawData}
      setRawData={setRawData}
      parsed={parsed}
      parseError={parseError}
      onFile={handleFile}
      onParse={(text) => doParse(text || rawData)}
      onImport={handleImport}
      importing={importing}
      result={result}
      setResult={setResult}
      customPreview={mappedPreview}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT CALENDAR CSV IMPORT
// ═══════════════════════════════════════════════════════════════════════════════


// Schema field → display label (matches the dashboard UI 1:1)
const CONTENT_PREVIEW_COLS = [
  { field: 'week', label: 'Week' },
  { field: 'blog_title', label: 'Blog Title' },
  { field: 'primary_keyword', label: 'Keyword' },
  { field: 'writer', label: 'Writer' },
  { field: 'blog_doc_link', label: 'Blog Doc' },
  { field: 'blog_link', label: 'Blog Link' },
  { field: 'published_date', label: 'Published' },
  { field: 'topic_approval_status', label: 'Topic Appr.' },
  { field: 'blog_status', label: 'Blog Status' },
  { field: 'blog_internal_approval', label: 'Internal Appr.' },
]

function ContentCSVImport({ clients }) {
  const [selectedClient, setSelectedClient] = useState('__none__')
  const [rawData, setRawData] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mappedRows, setMappedRows] = useState([])
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const doParse = (text) => {
    setParseError('')
    try {
      const p = parseSpreadsheet(text)
      if (!p) { setParseError('Could not parse. Make sure there is a header row and at least one data row.'); setParsed(null); setMappedRows([]); return }

      console.log('[content-import] 📋 Raw sheet columns:', p.headers)

      const mapped = p.rows.map(r => rowToContent(r, p.headers, 'preview')).filter(Boolean)
      console.log('[content-import] ✅ Mapped', mapped.length, 'of', p.rows.length, 'rows | Sample:', mapped[0])

      if (mapped.length === 0) {
        setParsed({ ...p, validCount: 0, unsupported: true, unsupportedMsg: 'No rows with a recognisable "Blog Title" or "Title" column found.' })
        setMappedRows([])
        return
      }

      setParsed({ ...p, validCount: mapped.length })
      setMappedRows(mapped)
    } catch (e) { setParseError('Parse error: ' + (e?.message || 'Unknown error')); setParsed(null); setMappedRows([]) }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try { const text = await file.text(); setRawData(text); doParse(text) }
    catch (e) { setParseError('Could not read file: ' + (e?.message || '')) }
  }

  const handleImport = async () => {
    if (!parsed || selectedClient === '__none__') return
    setImporting(true); setResult(null)
    const items = safeArray(parsed.rows).map(r => rowToContent(r, parsed.headers, selectedClient)).filter(Boolean)
    console.log('[content-import] 🚀 Sending', items.length, 'items | First item:', items[0])
    if (items.length === 0) {
      setResult({ success: 0, failed: parsed.rows.length, total: parsed.rows.length, error: 'No valid content items found — ensure your spreadsheet has a "Blog Title" column.' })
      setImporting(false); return
    }
    try {
      const res = await apiFetch('/api/content/bulk', { method: 'POST', body: JSON.stringify({ items, client_id: selectedClient }) })
      let data = {}; try { data = await res.json() } catch (e) { /* ignore */ }
      if (res.ok) {
        setResult({ success: data.imported ?? items.length, failed: data.failed ?? 0, total: items.length, errors: safeArray(data.errors) })
        setParsed(null); setMappedRows([]); setRawData('')
      } else { setResult({ success: 0, failed: items.length, total: items.length, error: data.error || `Server error (${res.status})` }) }
    } catch (e) { setResult({ success: 0, failed: 0, total: 0, error: 'Network error: ' + (e?.message || 'Could not reach server') }) }
    finally { setImporting(false) }
  }

  const mappedPreview = mappedRows.length > 0 && (
    <Card className="border border-gray-200">
      <CardHeader>
        <CardTitle className="text-base">
          Preview <span className="text-xs font-normal text-gray-400">(exactly what will be saved · {mappedRows.length} rows)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                {CONTENT_PREVIEW_COLS.map(c => (
                  <th key={c.field} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mappedRows.slice(0, 8).map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {CONTENT_PREVIEW_COLS.map(c => (
                    <td key={c.field} className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate" title={row[c.field] || ''}>
                      {row[c.field] || <span className="text-gray-300 italic">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
          <span className="font-medium">{mappedRows.length}</span> rows ready to import
        </div>
      </CardContent>
    </Card>
  )

  return (
    <ImportShell
      title="Upload Content Calendar CSV or Paste from Sheets"
      actionLabel="content items"
      clients={clients}
      selectedClient={selectedClient}
      setSelectedClient={setSelectedClient}
      rawData={rawData}
      setRawData={setRawData}
      parsed={parsed}
      parseError={parseError}
      onFile={handleFile}
      onParse={(text) => doParse(text || rawData)}
      onImport={handleImport}
      importing={importing}
      result={result}
      setResult={setResult}
      customPreview={mappedPreview}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLICKUP IMPORT (unchanged, just error-hardened)
// ═══════════════════════════════════════════════════════════════════════════════

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
    setError(''); setLoadingWS(true)
    try {
      const res = await apiFetch('/api/clickup/workspaces', { method: 'POST', body: JSON.stringify({ token: apiToken }) })
      let data = {}; try { data = await res.json() } catch (e) { /* ignore */ }
      if (!res.ok) { setError(data.error || 'Failed to fetch workspaces'); return }
      setWorkspaces(safeArray(data.workspaces)); setTokenSaved(true)
    } catch (e) { setError('Network error: ' + (e?.message || 'Could not connect')) }
    finally { setLoadingWS(false) }
  }

  const fetchLists = async (wsId) => {
    setSelectedWS(wsId); setLists([]); setSelectedLists([])
    if (wsId === '__none__') return
    setLoadingLists(true)
    try {
      const res = await apiFetch('/api/clickup/lists', { method: 'POST', body: JSON.stringify({ token: apiToken, workspace_id: wsId }) })
      let data = {}; try { data = await res.json() } catch (e) { /* ignore */ }
      if (!res.ok) { setError(data.error || 'Failed to fetch lists'); return }
      setLists(safeArray(data.lists))
    } catch (e) { setError('Network error: ' + (e?.message || 'Could not fetch lists')) }
    finally { setLoadingLists(false) }
  }

  const toggleList = (id) => setSelectedLists(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const runImport = async () => {
    if (selectedLists.length === 0 || selectedClient === '__none__') return
    setImporting(true); setResult(null); setImportLog([]); setError('')
    log(`Starting import of ${selectedLists.length} list(s)...`)
    try {
      const res = await apiFetch('/api/clickup/import', { method: 'POST', body: JSON.stringify({ token: apiToken, list_ids: selectedLists, client_id: selectedClient, members }) })
      let data = {}; try { data = await res.json() } catch (e) { /* ignore */ }
      if (!res.ok) { setError(data.error || 'Import failed'); return }
      setResult(data)
      log(`✅ Done! ${data.imported ?? 0} tasks imported, ${data.skipped ?? 0} skipped.`)
    } catch (e) { setError('Network error: ' + (e?.message || '')); log('❌ Import failed') }
    finally { setImporting(false) }
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
        <Card className="border border-gray-200">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Key className="w-4 h-4" />Step 1: ClickUp API Token</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">ClickUp → <b>Settings</b> → <b>Apps</b> → <b>API Token</b></p>
            <div className="flex gap-2">
              <Input type="password" value={apiToken} onChange={e => { setApiToken(e.target.value); setTokenSaved(false); setWorkspaces([]); setLists([]) }} placeholder="pk_xxxxxxxxxxxxxxxxxxxx" className="font-mono text-sm" />
              <Button onClick={fetchWorkspaces} disabled={loadingWS || !apiToken.trim()} className="flex-shrink-0">
                {loadingWS ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
              </Button>
            </div>
            {tokenSaved && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Connected — {workspaces.length} workspace(s) found</p>}
          </CardContent>
        </Card>

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
            {loadingLists && <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin" />Fetching lists...</div>}
            {lists.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-2">Select lists ({selectedLists.length} selected):</p>
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

        <Card className={`border ${(selectedLists.length === 0 || selectedClient === '__none__') ? 'border-gray-100 opacity-60' : 'border-blue-200 bg-blue-50'}`}>
          <CardHeader><CardTitle className="text-base">Step 4: Run Import</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-500">{selectedLists.length} list(s) → {clients.find(c => c.id === selectedClient)?.name || '—'}</p>
            <Button className="w-full" onClick={runImport} disabled={importing || selectedLists.length === 0 || selectedClient === '__none__'}>
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
