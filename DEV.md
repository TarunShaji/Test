# CubeHQ Dashboard - Technical Documentation (DEV.md)

This document provides an in-depth technical analysis of the CubeHQ Dashboard architecture, data flow, and feature implementation.

---

## 1. System Architecture Overview

The application is built using the **Next.js 14 (App Router)** framework, providing a unified environment for both frontend components and backend API handlers.

- **Frontend**: React with Tailwind CSS, Radix UI for accessible components, and **SWR** for client-side data fetching and caching.
- **Backend**: Next.js Route Handlers (modularized), JWT-based authentication, and MongoDB as the primary data store.
- **Observability**: Centralized logging via `lib/logger.js` and global request middleware.

---

## 2. Database Architecture (MongoDB)

The system uses a document-oriented database with the following primary collections:

### Collections & Schema
1. **`clients`**: Stores agency client profiles.
   - `id` (UUID): Unique identifier.
   - `slug` (Indexed): URL-friendly name.
   - `portal_password`: Hashed or null if public.
2. **`tasks`**: Core work items.
   - `client_id` (Indexed): Relates to a client.
   - `status`: One of `To Be Started`, `In Progress`, `To Be Approved`, `Completed`, `Blocked`, `Recurring`.
   - `assigned_to`: UUID of a team member.
3. **`content_items`**: Blog and social media management.
   - `client_id` (Indexed): Relates to a client.
   - `blog_status`: Draft, In Progress, Published, etc.
4. **`team_members`**: Agency staff accounts.
   - `password_hash`: Bcrypt hashed password.
   - `role`: Admin or Member.
5. **`reports`**: Links to external client reports (e.g., Looker Studio).

### Performance Optimization
Indexes are applied to frequently filtered fields:
- `tasks`: `client_id`, `status`, `assigned_to`, `updated_at`, `signature` (unique).
- `content_items`: `client_id`, `id` (unique).
- `clients`: `slug` (unique), `id` (unique).
- `team_members`: `email` (unique), `id` (unique).

---

## 3. Backend API Implementation

The API is fully modularized under `app/api/`. Every request passes through a global **Next.js Middleware** for logging and observability.

### Core Utilities (`lib/`)
- **`mongodb.js`**: Managed connection pooling for MongoDB.
- **`api-utils.js`**: Standardized wrappers:
  - `withAuth`: Enforces JWT verification via **httpOnly secure cookies** in production (with a Header fallback permitted only in dev/scripts).
  - `withErrorLogging`: Captures handler crashes, logs stack traces, and returns sanitized 500 errors.
- **`logger.js`**: Structured JSON logging to the server console.

### Key API Flows
1. **Authentication (`/api/auth/login`)**:
   - Compares credentials against `team_members` using `bcrypt`.
   - Signs a JWT containing user identity and role.
2. **Stats Aggregation (`/api/stats`)**:
   - Performs multiple concurrent `countDocuments` operations across collections.
   - Returns a summary of active work for the main dashboard dashboard.
3. **ClickUp Ingestion (`/api/clickup/import`)**:
   - Authenticates with ClickUp API.
   - Iteratively fetches tasks from multiple List IDs.
   - Maps ClickUp statuses to internal `CU_STATUS` tokens.

---

## 4. Frontend Feature Deep Dive

### Data Fetching Strategy (SWR)
We use **SWR** (`stale-while-revalidate`) for almost all data requirements. 
- **Deduplication**: Multiple components can request `/api/team` or `/api/clients` simultaneously; SWR ensures only one network request is dispatched.
- **Optimistic UI**: When updating a task status, SWR allows for immediate UI updates while revalidating in the background.

### Page Breakdowns

#### 1. Main Dashboard (`app/dashboard/page.js`)
- **Content**: High-level KPI cards (Active Clients, Blocked Tasks, etc.) and a Recent Activity feed.
- **API Calls**: `GET /api/stats`
- **Behavior**: Uses `useSWR` with a refresh interval to keep agency status up to date.

#### 2. Client Management (`app/dashboard/clients/`)
- **List View**: Displays all clients with summarized task counts.
- **Detail View (`[id]/page.js`)**: The most complex page.
  - Fetches: Client metadata, specialized tasks list, content calendar, and reports.
  - **Inline Editing**: Uses `EditableCell` components that trigger `PUT` requests to `/api/tasks/[id]` or `/api/content/[id]` on blur.
  - **Context Sharing**: Leverages `lib/constants.js` to ensure the status dropdowns match exactly between the Admin Dashboard and the Client Portal.

#### 3. Client Portal (`app/portal/[slug]/page.js`)
- **Security**: Checks `clients.portal_password`. If present, renders a password gate.
- **Interaction**: Clients can "Approve" or "Request Changes" on tasks. This triggers:
  - `PUT /api/portal/[slug]/tasks/[taskId]/approval`
  - This specialized route manages status transitions without requiring an agency login token.

---

#### 4. Content Calendar (`app/dashboard/content/page.js`)
- **UI**: A list of blog posts with spreadsheet-style inline editing.
- **Data Flow**:
  - `GET /api/content`: Fetches all items, enriched with `client_name`.
  - `PUT /api/content/[id]`: Updates individual fields (e.g., `blog_status`, `keyword`).
  - `DELETE /api/content/[id]`: Removes item from `content_items` collection.
- **Interactions**: Uses SWR for real-time list updates. Updates are debounced and sent as individual `PUT` requests to ensure atomic DB updates.

#### 5. Import Hub (`app/dashboard/import/page.js`)
- **Features**:
  - **CSV Path**: Clientside parsing using standard file readers. Ingests via `POST /api/content/bulk`.
  - **ClickUp Path**:
    1. Authenticate API Key.
    2. `POST /api/clickup/workspaces`: Proxies to ClickUp to list accessible teams.
    3. `POST /api/clickup/lists`: Fetches lists within a selected workspace.
    4. `POST /api/clickup/import`: The heavy lifter. Performs background fetching of tasks, transforms them into the agency schema, and uses `insertMany` for efficient DB ingestion.

#### 6. Team & Admin
- **Team Hub**: `GET /api/team` (list) and `POST /api/team` (create with bcrypt hashing).
- **Security**: Admin-only routes (eventually) will use role-based checks inside `withAuth`. Currently, all authenticated staffers have full access.

---

## 5. Middleware & Logging (Observability)

Every API request is traced:
1. **Middleware**: `middleware.js` captures every `/api` call before it hits the handler, logging `[BACKEND] [API_REQ]`.
2. **Standard Wrappers**:
   - `withErrorLogging(request, handler)`: Catches any unhandled error, logs the stack trace to `lib/logger.js`, and prevents the server from returning sensitive internal errors to the client.
3. **Frontend Correlation**: Browser logs `[FRONTEND] [API_RES]` with matching timestamps and durations, allowing developers to correlate frontend lag with backend performance.

---

## 6. Development & Verification

### Testing Suite
Located in `tests/backend_test.py`, this Python integration suite simulates:
1. Database seeding (`/api/seed`).
2. Authentication lifecycle.
3. CRUD operations for every major entity.
4. Portal access and state mutations.

### Helper Scripts
- `scripts/db-setup.js`: Idempotent script to apply necessary database optimizations (Run via `yarn setup:db`).
- `scripts/db-truncate.js`: Deletes all documents from primary collections for a fresh start (Run via `yarn db:truncate`).
