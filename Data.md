# Data Mapping & Schema: Tasks & Content Calendar

This document provides a comprehensive end-to-end overview of how data flows from a spreadsheet paste to the database and finally to the user interface.

## 1. Data Ingestion & Normalization

### Pasta Mechanism
When data is pasted from Google Sheets or Excel into the Dashboard, it is parsed into a raw JSON array. Before mapping, every value and header passes through `lib/import/normalize.js`.

| Step | Function | Purpose |
|---|---|---|
| **Header Normalization** | `normHeader()` | Lowercases, trims, and collapses spaces/dashes (e.g., "Task_Name" → "task name"). |
| **Value Normalization** | `safeStr()` | Trims whitespace and handles nulls. |
| **URL Extraction** | `extractUrl()` | Detects URLs in cells like "Draft (https://...)" or plain text domains. |
| **Date Normalization** | `normalizeDate()` | Converts formats like `DD/MM/YYYY`, `MM/DD/YYYY`, or `1 Mar` into ISO `YYYY-MM-DD`. |

---

## 2. The Task Schema

### Mapping Context (`lib/import/task-mapping.js`)
Keywords are used to find relevant columns in the sheet. If multiple columns match, the first match is used.

| Field | Keywords | Type | Default / Logic |
|---|---|---|---|
| **title** (Req) | `task`, `name`, `to-do`, `deliverable` | String | Fallback to column 0 if no match. |
| **status** | `status` | Enum | Mapped via `TASK_STATUS_MAP` (e.g., "WIP" → "In Progress"). |
| **category** | `category`, `type`, `industry` | String | Defaults to "Other". |
| **priority** | `priority` | Enum | Validates strictly for `P0`, `P1`, `P2`, `P3`. Defaults to `P2`. <br> *ClickUp CSV Mode:* URGENT→P0, HIGH→P1, NORMAL→P2, none→P3. |
| **link_url** | `link`, `url`, `live link` | URL | Extracted and normalized. |
| **assigned_to** | `assigned`, `owner`, `assignee` | String | Reference to team member name or ID. |
| **eta_end** | `eta`, `due`, `deadline`, `required by` | Date | Converted to `YYYY-MM-DD`. |
| **remarks** | `remark`, `note`, `feedback` | String | Stored as text. |

### Database Schema (`lib/schemas/task.schema.js`)
Persisted in the `tasks` collection.
```javascript
{
  id: UUID,
  client_id: UUID,
  title: String,
  status: "To Be Started" | "In Progress" | "Pending Review" | "Completed" | "Blocked",
  priority: "P0" | "P1" | "P2" | "P3",
  category: String,
  link_url: URL,
  assigned_to: String,
  eta_start: DateString,
  eta_end: DateString,
  remarks: String,
  internal_approval: "Pending" | "Approved" | "Required Changes",
  signature: SHA256 (Idempotency Key)
}
```

---

## 3. The Content Calendar Schema

### Mapping Context (`lib/import/content-mapping.js`)
The content importer is strictly minimal. It only imports **Intent/Planning** fields. Workflow fields (Approval, Status) are managed exclusively in the Dashboard.

| Field | Keywords | Mapping Constraint |
|---|---|---|
| **blog_title** (Req) | `title`, `topic`, `article` | Primary identifier. |
| **week** | `week`, `wk` | String label. |
| **blog_doc_link** | `blog doc`, `outline` | Draft URL (Google Doc). |
| **blog_link** | `blog link`, `live link` | Live published URL. |

> [!IMPORTANT]
> Fields like `blog_status`, `internal_approval`, and `ai_score` are **ignored** during sheet import to prevent overriding the current production workflow state.

### Database Schema (`lib/schemas/content.schema.js`)
Persisted in the `content_items` collection.
```javascript
{
  blog_title: String,
  client_id: UUID,
  week: String,
  blog_status: "Draft" | "In Progress" | "Sent for Approval" | "Published",
  topic_approval_status: "Pending" | "Approved" | "Rejected",
  blog_internal_approval: "Pending" | "Approved",
  blog_doc_link: URL (Google Doc),
  blog_link: URL (Live),
  client_link_visible_blog: Boolean
}
```

---

## 4. End-to-End Flow

### A. Ingestion (Client-side)
1. User clicks **Import** and pastes spreadsheet data.
2. `getMappedHeaders()` filters the view to show only recognized columns.
3. User confirms preview.

### B. Persistence (Server-side)
Endpoint: `/api/tasks/bulk` or `/api/content/bulk`
1. **Validation**: Zod strips unknown fields.
2. **Lifecycle Engine**: `applyTaskTransition(null, data)` is called. This injects system defaults (e.g., `status: "To Be Started"`) and ensures business rules are followed before the first write.
3. **Idempotency**: A `signature` is generated from `client_id` + `title` + `eta`.
4. **Bulk Write**: MongoDB `bulkWrite` with `upsert: true` ensures that re-importing the same sheet doesn't create duplicate tasks.

### C. Display (UI)
1. Dashboard fetches data via `GET /api/tasks?client_id=...`.
2. Data is rendered in `<TaskTable>` or `<ContentTable>`.
3. **Logic Layer**: The UI uses the same `lifecycleEngine.js` rules to determine which buttons (like "Send Link" or "Approve") are enabled based on the current state.
