# CubeHQ Dashboard - Technical Documentation (DEV.md)

This document provides a deep technical breakdown of the CubeHQ Dashboard architecture, its reorganized directory structure, data flow, and core business logic.

---

## 1. System Architecture Overview

The application is a **Next.js 14** app using the **App Router** for both the frontend UI and backend API routes.

- **Frontend**: React (Client Components), Tailwind CSS, Radix UI (via shadcn/ui), and **SWR** for real-time data synchronization.
- **Backend**: Next.js Route Handlers, MongoDB (Native Driver), and JWT-based authentication.
- **Organization**: The codebase was recently restructured to separate concerns into logical domains (db, middleware, engine).

---

## 2. Directory Structure (Reorganized)

The project follows a modular structure where `lib/` contains the core engine and utilities, and `app/` handles routing.

### `lib/` — The Core
- **`lib/db/`**:
  - `mongodb.js`: Manages the `MongoClient` singleton and connection pooling.
  - `schemas/`: Centralized **Zod** definitions. Exported via `index.js`.
- **`lib/engine/`**:
  - `lifecycle.js`: **The most important file.** Contains `applyTaskTransition` and `applyContentTransition`. This is where all business rules (invariants) for state changes are enforced.
- **`lib/middleware/`**:
  - `auth.js`: Clientside auth helpers (`apiFetch`, `swrFetcher`).
  - `api-utils.js`: Serverside wrappers like `withAuth` and `withErrorLogging`.
  - `validation.js`: Higher-order function to validate request bodies against Zod schemas before hitting handlers.
- **`lib/import/`**: Logic for CSV/Sheets parsing and fuzzy header matching (`normalize.js`).

---

## 3. Database & Schemas

We use **MongoDB** with **Zod** for runtime validation.

### Database Connection (`lib/db/mongodb.js`)
Uses a singleton pattern to prevent multiple connections during Next.js Hot Module Replacement (HMR).
```javascript
export async function connectToMongo() { 
  if (!client || !db) { ... } 
  return db; 
}
```

### Core Collections
1. **`clients`**: Agency clients. Tracked by `id` (UUID) and `slug` (for portal URLs).
2. **`tasks`**: Individual work items. Complex state transitions.
3. **`content_items`**: Blog/Content items. Spreadsheet-style management.
4. **`team_members`**: Agency staff with hashed passwords.

---

## 4. The Lifecycle Engine (`lib/engine/lifecycle.js`)

To prevent the database from entering an invalid state, **all state changes must pass through the Lifecycle Engine.**

### Task Invariants (`assertTaskInvariant`)
Ensures logical consistency. Examples:
- A task cannot be "Sent" to a client unless it is "Completed" AND has "Internal Approval".
- If a client requests changes, the task must revert to "In Progress".

### State Transitions (`applyTaskTransition`)
Handles side-effects of changes.
- **Status Revert**: If a `Completed` task is moved back to `In Progress`, it automatically clears `internal_approval` and `client_link_visible`.
- **Link Reset**: Changing the `link_url` on a sent task resets its approval status to ensure the new link is QA'd.

---

## 5. Backend Patterns

### Standard API Route Template
Most routes follow this pattern:
```javascript
export const PUT = withErrorLogging(withAuth(async (req, { params }) => {
  const body = await req.json();
  const db = await connectToMongo();
  
  // 1. Fetch current state
  // 2. Apply transition via lifecycle engine
  // 3. Update DB
  // 4. Return updated document
}));
```

### Validation Middleware
Routes often use `validateBody(Schema)` to ensure the payload matches the expected structure before any logic runs.

---

## 6. Frontend Patterns (SWR & Optimistic UI)

### Data Syncing
We use **SWR** to manage server state.
- **Envelope Pattern**: Our APIs return paginated objects `{ data: [], total: 0, ... }`.
- **Global Mutation**: When editing a cell, we perform an **Optimistic Update** using `mutateContent({ ...old, data: updated }, false)`. This ensures the UI is instant while the server processes the change.

### Components
- **`EditableCell`**: A reusable component that handles text, select, and status-badge editing.
- **`DndContext`**: Used in `tasks/page.js` and `content/page.js` for column and row reordering.

---

## 7. Development & Verification

### Scripts
- `npm run dev`: Starts the local development server.
- `yarn setup:db`: Applies MongoDB indexes (defined in `scripts/db-setup.js`).
- `scripts/db-reset-all.js`: Clears all collections.

### Quality Assurance
- **Build Check**: Always run `npm run build` before pushing.
- **Schema Validation**: Zod schemas are enforced in API routes via `validateBody(...)` middleware.
