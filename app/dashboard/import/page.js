'use client'
import { useState } from 'react'
import { parse, isValid, format } from 'date-fns'
import useSWR from 'swr'
import { apiFetch, swrFetcher } from '@/lib/auth'
import { safeArray } from '@/lib/safe'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Upload, CheckCircle, AlertCircle, Loader2, Key, FileText, ListTodo } from 'lucide-react'

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Normalize a column header: lowercase, trim, collapse whitespace */
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Find the first matching header from a list of keyword patterns */
const findHeader = (headers, keywords) =>
  headers.find(h => keywords.some(k => norm(h).includes(k))) || null

/** Safe string — empty string becomes null */
const str = (v) => { const s = String(v || '').trim(); return s || null }

/** RFC-4180 compliant CSV/TSV parser. Handles quoted fields, embedded newlines, mixed spacing. */
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

/** Flexible date parsing from any spreadsheet date format */
function parseDate(s) {
  if (!s) return null
  const raw = String(s).trim()
  if (!raw) return null
  const fmts = [
    'yyyy-MM-dd', 'dd-MM-yyyy', 'MM-dd-yyyy', 'dd/MM/yyyy', 'MM/dd/yyyy',
    'MMM d, yyyy', 'MMMM d, yyyy', 'd MMM yyyy', 'd MMMM yyyy',
    'yyyy/MM/dd', 'd-M-yyyy', 'M-d-yyyy', 'd/M/yyyy', 'M/d/yyyy',
  ]
  for (const f of fmts) {
    try { const d = parse(raw, f, new Date()); if (isValid(d)) return format(d, 'yyyy-MM-dd') } catch (e) { /* skip */ }
  }
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd')
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK ROW → SCHEMA
// Only sets fields that exist in TaskCreateSchema.
// Schema: title, client_id, status, category, priority, link_url, assigned_to, eta_end, remarks
// ═══════════════════════════════════════════════════════════════════════════════

const TASK_STATUS_MAP = {
  'implemented/ completed': 'Completed', 'implemented/completed': 'Completed',
  'completed': 'Completed', 'complete': 'Completed', 'done': 'Completed', 'fixed': 'Completed',
  'work in progress': 'In Progress', 'in progress': 'In Progress', 'wip': 'In Progress',
  'to be approved': 'Pending Review', 'pending approval': 'Pending Review',
  'in review': 'Pending Review', 'review': 'Pending Review',
  'recurring': 'Recurring', 'blocked': 'Blocked',
  'to be started': 'To Be Started', 'not started': 'To Be Started',
  'pending': 'To Be Started', 'open': 'To Be Started', 'to do': 'To Be Started',
}
function mapTaskStatus(s) {
  if (!s) return 'To Be Started'
  return TASK_STATUS_MAP[norm(s)] || 'To Be Started'
}

/**
 * Maps a spreadsheet row → task object (only schema-valid fields).
 * Returns null if no title found.
 */
function rowToTask(row, headers, clientId) {
  const h = (kws) => findHeader(headers, kws)

  // Title — required
  const titleField = h(['to-do', 'todo', 'task name', 'task title', 'task', 'title', 'name', 'action item', 'action items', 'item', 'description', 'deliverable']) || headers[0]
  const title = str(row[titleField])
  if (!title) return null

  // Only include fields that are in the schema
  const task = { client_id: clientId, title }

  const statusField = h(['status'])
  if (statusField && str(row[statusField])) task.status = mapTaskStatus(row[statusField])

  const catField = h(['category', 'type', 'group', 'service', 'industry'])
  if (catField && str(row[catField])) task.category = str(row[catField])

  const priorityField = h(['priority'])
  const pRaw = str(row[priorityField || ''])
  if (pRaw && ['P0', 'P1', 'P2', 'P3'].includes(pRaw.toUpperCase())) task.priority = pRaw.toUpperCase()

  const linkField = h(['link', 'url', 'live link', 'page url'])
  if (linkField && str(row[linkField])) task.link_url = str(row[linkField])

  const assignedField = h(['assigned to', 'assigned', 'owner', 'assignee', 'team member'])
  if (assignedField && str(row[assignedField])) task.assigned_to = str(row[assignedField])

  const etaField = h(['eta', 'due', 'deadline', 'due date', 'date', 'timeline', 'completion date', 'required by', 'required'])
  if (etaField && str(row[etaField])) task.eta_end = parseDate(row[etaField])

  const remarksField = h(['remark', 'remarks', 'note', 'notes', 'comment', 'comments', 'detail', 'details', 'feedback'])
  if (remarksField && str(row[remarksField])) task.remarks = str(row[remarksField])

  return task
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT ROW → SCHEMA
// Only sets fields that exist in ContentSchema.
// Schema: blog_title, client_id, primary_keyword, week, writer, blog_status,
//         blog_type, blog_link, published_date, topic_approval_status, blog_approval_status
// ═══════════════════════════════════════════════════════════════════════════════

const BLOG_STATUS_MAP = {
  'draft': 'Draft', 'in progress': 'In Progress', 'wip': 'In Progress',
  'sent for approval': 'Sent for Approval', 'sent': 'Sent for Approval',
  'in review': 'Sent for Approval', 'review': 'Sent for Approval',
  'published': 'Published', 'live': 'Published', 'done': 'Published',
}
function mapBlogStatus(s) {
  if (!s) return 'Draft'
  return BLOG_STATUS_MAP[norm(s)] || 'Draft'
}

const OUTLINE_STATUS_MAP = {
  'pending': 'Pending', 'submitted': 'Submitted', 'approved': 'Approved',
  'rejected': 'Rejected', 'done': 'Submitted',
}
function mapOutlineStatus(s) {
  if (!s) return 'Pending'
  return OUTLINE_STATUS_MAP[norm(s)] || 'Pending'
}

/**
 * Maps a spreadsheet row → content item (only schema-valid fields).
 * Returns null if no blog_title found.
 */
function rowToContent(row, headers, clientId) {
  const h = (kws) => findHeader(headers, kws)

  // Title — required
  const titleField = h(['blog title', 'blog name', 'blog topic', 'title', 'topic', 'name', 'article'])
  const blog_title = str(row[titleField || headers[0]])
  if (!blog_title) return null

  const item = { client_id: clientId, blog_title }

  // Week
  const weekField = h(['week'])
  if (weekField && str(row[weekField])) item.week = str(row[weekField])

  // Primary keyword
  const kwField = h(['primary keyword', 'primary keywords', 'keyword', 'main keyword'])
  if (kwField && str(row[kwField])) item.primary_keyword = str(row[kwField])

  // Blog type
  const typeField = h(['blog type', 'type', 'content type', 'content goal', 'goal'])
  if (typeField && str(row[typeField])) item.blog_type = str(row[typeField])

  // Writer / Intern
  const writerField = h(['intern name', 'intern', 'writer', 'author', 'assigned'])
  if (writerField && str(row[writerField])) item.writer = str(row[writerField])

  // Outline status
  const outlineField = h(['outline'])
  if (outlineField && str(row[outlineField])) item.outline_status = mapOutlineStatus(row[outlineField])

  // Blog status
  const statusField = h(['blog status', 'status', 'intern status'])
  if (statusField && str(row[statusField])) item.blog_status = mapBlogStatus(row[statusField])

  // Blog link — extract first URL from cell (handles "https://… 26/11/25" style)
  const linkField = h(['live link', 'blog link', 'publishing link', 'link', 'url'])
  if (linkField) {
    const rawLink = str(row[linkField])
    if (rawLink) {
      const urlMatch = rawLink.match(/https?:\/\/[^\s'"]+/)
      if (urlMatch) item.blog_link = urlMatch[0]
    }
  }

  // Published date
  const pubField = h(['published date', 'date published', 'publishing date', 'publication date', 'date of publication', 'republished date'])
  if (pubField && str(row[pubField])) item.published_date = parseDate(row[pubField])

  return item
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
          <TabsTrigger value="clickup" className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5" />ClickUp</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks-csv">
          <TaskCSVImport clients={clients} />
        </TabsContent>

        <TabsContent value="content-csv">
          <ContentCSVImport clients={clients} />
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
  previewCols, // optional: max columns to show in preview
  actionLabel,
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
                      <p key={i} className="text-xs text-red-400 mt-0.5 truncate">{e.title || e}: {e.error}</p>
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
                placeholder="Paste tab-separated data from Google Sheets here..."
                className="w-full h-36 p-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 font-mono resize-none"
              />
              <Button size="sm" onClick={onParse} disabled={!rawData.trim()}>Parse</Button>
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
      {parsed ? (
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
              <span className="font-medium">{parsed.validCount ?? parsed.rows.length}</span> valid rows · <span className="font-medium">{parsed.headers.length}</span> columns detected
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
          <p className="text-gray-600">Task / Title / Name / To-do / Action Item</p>
        </div>
        <div>
          <p className="font-semibold text-gray-700 mb-1">Optional (auto-detected)</p>
          <ul className="space-y-0.5">
            <li><span className="font-medium">Status</span> → Work in Progress, Completed, Blocked…</li>
            <li><span className="font-medium">Category / Type</span></li>
            <li><span className="font-medium">Priority</span> → P0, P1, P2, P3</li>
            <li><span className="font-medium">Assigned to / Owner</span></li>
            <li><span className="font-medium">ETA / Due / Deadline / Required by</span></li>
            <li><span className="font-medium">Remarks / Notes / Comments</span></li>
            <li><span className="font-medium">Link / URL</span></li>
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded p-2 text-amber-700">
          Unknown columns are silently ignored — only schema fields are saved.
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
          <p className="text-gray-600">Blog Title / Blog Topic / Topic / Title</p>
        </div>
        <div>
          <p className="font-semibold text-gray-700 mb-1">Optional (auto-detected)</p>
          <ul className="space-y-0.5">
            <li><span className="font-medium">Week</span></li>
            <li><span className="font-medium">Primary Keyword</span></li>
            <li><span className="font-medium">Blog Type / Content Type / Content Goal</span></li>
            <li><span className="font-medium">Intern Name / Intern / Writer / Author</span></li>
            <li><span className="font-medium">Outline</span> → Pending, Submitted, Approved…</li>
            <li><span className="font-medium">Blog Status / Status / Intern Status</span></li>
            <li><span className="font-medium">Live Link / Blog Link / Publishing Link / URL</span></li>
            <li><span className="font-medium">Published Date / Publishing Date / Date Published</span></li>
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded p-2 text-amber-700">
          Columns like Search Volume, Meta Title, AI Score, Secondary Keywords, Client Comment, QC, etc. are recognised but <strong>not imported</strong> (not in schema). They appear in preview only.
        </div>
      </CardContent>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK CSV IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

function TaskCSVImport({ clients }) {
  const [selectedClient, setSelectedClient] = useState('__none__')
  const [rawData, setRawData] = useState('')
  const [parsed, setParsed] = useState(null)
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const doParse = (text) => {
    setParseError('')
    try {
      const p = parseSpreadsheet(text)
      if (!p) { setParseError('Could not parse. Make sure there is a header row and at least one data row.'); setParsed(null); return }
      const valid = p.rows.map(r => rowToTask(r, p.headers, 'dummy')).filter(Boolean)
      p.validCount = valid.length
      if (valid.length === 0) { p.unsupported = true; p.unsupportedMsg = 'No rows with a recognisable title column found. Rename your column to "Task", "Title", or "Name".' }
      setParsed(p)
    } catch (e) { setParseError('Parse error: ' + (e?.message || 'Unknown error')); setParsed(null) }
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
        setParsed(null); setRawData('')
      } else { setResult({ success: 0, failed: tasks.length, total: tasks.length, error: data.error || `Server error (${res.status})` }) }
    } catch (e) { setResult({ success: 0, failed: 0, total: 0, error: 'Network error: ' + (e?.message || 'Could not reach server') }) }
    finally { setImporting(false) }
  }

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
      onParse={() => doParse(rawData)}
      onImport={handleImport}
      importing={importing}
      result={result}
      setResult={setResult}
    />
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT CALENDAR CSV IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

function ContentCSVImport({ clients }) {
  const [selectedClient, setSelectedClient] = useState('__none__')
  const [rawData, setRawData] = useState('')
  const [parsed, setParsed] = useState(null)
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const doParse = (text) => {
    setParseError('')
    try {
      const p = parseSpreadsheet(text)
      if (!p) { setParseError('Could not parse. Make sure there is a header row and at least one data row.'); setParsed(null); return }
      const valid = p.rows.map(r => rowToContent(r, p.headers, 'dummy')).filter(Boolean)
      p.validCount = valid.length
      if (valid.length === 0) { p.unsupported = true; p.unsupportedMsg = 'No rows with a recognisable blog title column found. Rename your column to "Blog Title", "Topic", or "Title".' }
      setParsed(p)
    } catch (e) { setParseError('Parse error: ' + (e?.message || 'Unknown error')); setParsed(null) }
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
    if (items.length === 0) {
      setResult({ success: 0, failed: parsed.rows.length, total: parsed.rows.length, error: 'No valid content items found — ensure your spreadsheet has a "Blog Title" or "Topic" column.' })
      setImporting(false); return
    }
    try {
      const res = await apiFetch('/api/content/bulk', { method: 'POST', body: JSON.stringify({ items, client_id: selectedClient }) })
      let data = {}; try { data = await res.json() } catch (e) { /* ignore */ }
      if (res.ok) {
        setResult({ success: data.imported ?? items.length, failed: data.failed ?? 0, total: items.length, errors: safeArray(data.errors) })
        setParsed(null); setRawData('')
      } else { setResult({ success: 0, failed: items.length, total: items.length, error: data.error || `Server error (${res.status})` }) }
    } catch (e) { setResult({ success: 0, failed: 0, total: 0, error: 'Network error: ' + (e?.message || 'Could not reach server') }) }
    finally { setImporting(false) }
  }

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
      onParse={() => doParse(rawData)}
      onImport={handleImport}
      importing={importing}
      result={result}
      setResult={setResult}
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
