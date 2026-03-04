# Data Mapping & Schema: Tasks & Content Calendar

This document provides a comprehensive end-to-end overview of how data flows from a spreadsheet paste to the database and finally to the user interface.

---

## 1. Data Ingestion & Normalization

### Paste Mechanism
When data is pasted from Google Sheets or Excel, it is parsed into a raw JSON array. Before mapping, every value and header passes through `lib/import/normalize.js`.

| Step | Function | Purpose |
|---|---|---|
| **Header Normalization** | `normHeader()` | Lowercases, trims, and collapses spaces/dashes (e.g., "Task_Name" → "task name"). |
| **Value Normalization** | `safeStr()` | Trims whitespace and handles nulls. |
| **URL Extraction** | `extractUrl()` | Detects URLs in cells like "Draft (https://...)" or plain text domains. |
| **Date Normalization** | `normalizeDate()` | Converts formats like `DD/MM/YYYY`, `MM/DD/YYYY`, or `1 Mar` into ISO `YYYY-MM-DD`. |

---

## 2. The Task Schema

### Mapping Context (`lib/import/task-mapping.js`)
Keywords are used to find relevant columns. The `findHeader` helper prioritizes **exact matches** before falling back to substring matches.

| Field | Keywords | Type | Default / Logic |
|---|---|---|---|
| **title** (Req) | `task`, `name`, `to-do`, `deliverable`, `item` | String | Fallback to column 0 if no match. |
| **status** | `status` | Enum | Mapped via `TASK_STATUS_MAP` (e.g., "WIP" → "In Progress"). |
| **category** | `category`, `type`, `group`, `service`, `industry` | String | Extracted as plain text. |
| **priority** | `priority` | Enum | Defaults to `P2`. <br> *Normal:* Maps "Urgent/Critical"→P0, "High"→P1, "Medium"→P2, "Low"→P3. <br> *ClickUp CSV Mode:* URGENT→P0, HIGH→P1, NORMAL→P2, none→P3. |
| **link_url** | `link`, `url`, `live link`, `page url` | URL | Extracted and normalized. |
| **eta_end** | `eta`, `due`, `deadline`, `required by` | Date | Converted to `YYYY-MM-DD`. |

> [!NOTE]
> **assigned_to** is intentionally **not** mapped from spreadsheets. This field uses agency team member IDs and is managed exclusively via the Dashboard UI to ensure valid assignments.

### Database Schema (`lib/db/schemas/task.schema.js`)
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
  eta_end: DateString,
  internal_approval: "Pending" | "Approved",
  client_link_visible: Boolean,
  signature: SHA256 (Idempotency Key)
}
```

---

## 3. The Content Calendar Schema

### Mapping Context (`lib/import/content-mapping.js`)
The content importer focuses on **Planning & Metadata**. Workflow fields (Approval, Status) are managed exclusively in the Dashboard.

| Field | Keywords | Mapping Constraint |
|---|---|---|
| **blog_title** (Req) | `blog title`, `blog topic`, `title`, `topic` | Primary identifier. |
| **week** | `week`, `wk` | String number (1-10). |
| **primary_keyword** | `keyword`, `primary keyword` | Stored as plain text. |
| **writer** | `writer`, `author` | Stored as plain text. |
| **blog_doc_link** | `blog doc`, `blog document`, `blog` | Draft URL (Google Doc). |
| **blog_link** | `blog link`, `live link` | Live published URL. |
| **published_date** | `published`, `published date` | ISO `YYYY-MM-DD`. |

> [!IMPORTANT]
> **Safety Logic for 'Blog' Header**: If a column named exactly "Blog" is found, the importer prioritizes it as the `blog_doc_link` (usually a doc link) rather than the `blog_title` to prevent mis-mapping.

---

## 4. The Lifecycle Engine (`lib/engine/lifecycle.js`)

Before any data is written to the database (Initial Import or Edit), it must pass through the Lifecycle Engine. This ensures the dashboard remains in a "legal" state.

### Core Invariants
- **Visibility Guard**: `client_link_visible` cannot be `true` unless `internal_approval` is `Approved` AND the task/content is `Completed`/`Published`.
- **Feedback Loop**: Transitioning `client_approval` to `Required Changes` automatically sets the status back to `In Progress` and hides the link from the client.
- **Link Reset**: If the `link_url` or `blog_doc_link` is changed after being sent to the client, the system automatically resets the approval status to `Pending` to force a new QA pass.

---

## 5. End-to-End Persistence Flow

1. **Ingestion**: User pastes data into `/dashboard/import`.
2. **Preview**: `getMappedHeaders()` ensures only recognized columns are shown.
3. **Drafting**: `rowToTask` or `rowToContent` transforms raw rows into schema-aligned objects.
4. **Validation**: The backend API uses **Zod** (`lib/db/schemas`) to strip unknown fields and enforce types.
5. **Logic**: The API calls `applyTaskTransition` or `applyContentTransition` (from the Lifecycle Engine) to inject defaults and apply business rules.
6. **Upsert**: MongoDB `bulkWrite` uses a `signature` (SHA-256 of ClientID + Title + Date) to ensure that re-importing the same sheet updates existing items instead of creating duplicates.
