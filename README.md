# CubeHQ Dashboard

A high-performance, agency-grade dashboard for managing client tasks, content calendars, and reporting. Built with **Next.js 14 (App Router)** and **MongoDB**, this project provides a unified interface for agency staffers and a secure, white-labeled portal for clients.

---

## 🚀 Technical Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Node.js Runtime)
- **Database**: [MongoDB](https://www.mongodb.com/) (Native Driver)
- **Authentication**: JWT-based with `httpOnly` secure cookies & Bcrypt hashing
- **State Management**: [SWR](https://swr.vercel.app/) (Stale-While-Revalidate) for real-time data fetching
- **UI Architecture**: Tailwind CSS + Radix UI (Headless) + Lucide Icons
- **Validation**: [Zod](https://zod.dev/) for strict schema enforcement
- **Invariants**: Custom Lifecycle Engine for atomic state transitions

---

## 🏗️ Core Architecture & Modules

### 1. The Lifecycle Engine (`lib/lifecycleEngine.js`)
The "brain" of the application. It prevents invalid state transitions (e.g., you cannot mark a task as "Client Visible" if it hasn't been "Internally Approved"). It enforces **Business Invariants** across both Tasks and Content items.

### 2. Intelligent Import Pipeline (`lib/import/`)
Supports high-volume data ingestion from Google Sheets or CSV exports.
- **Normalization**: Automatically cleans headers, extracts URLs from strings, and standardizes date formats (via `normalize.js`).
- **Mapping**: Dynamic keyword-to-field matching for Content and Tasks.
- **ClickUp Integration**: Specialized one-time import mode for ClickUp CSV exports with custom priority mapping (URGENT → P0).
- **Idempotency**: Uses SHA-256 signatures to prevent duplicate imports during bulk operations.

### 3. API Design & Security
All API routes are standardized for reliability and observability:
- **Node.js Runtime**: Explicitly enforced across all 30+ endpoints for consistent performance.
- **Wrappers**: `withAuth` and `withErrorLogging` ensure every request is authenticated and crashes are captured with full stack traces.
- **Centralized Logging**: Structured server-side logging for request tracing (`[BACKEND] [API_REQ]`).

### 4. Client Portals (`app/portal/[slug]`)
Secure, slug-based portals where clients can view live progress, approve deliverables, or request changes. 
- **Password Protection**: Optional per-client password gates.
- **State Sync**: Real-time feedback loop between the agency dashboard and the client's view.

---

## 📂 Project Structure

```text
├── app/
│   ├── api/             # Standardized API routes (Node.js runtime)
│   ├── dashboard/       # Agency-side views (Tasks, Content, Clients)
│   └── portal/          # Client-facing white-labeled views
├── components/          # Shared shadcn/ui & custom UI components
├── lib/
│   ├── import/          # Normalization & Mapping logic
│   ├── schemas/         # Zod validation schemas
│   ├── lifecycleEngine.js # Business logic & state transitions
│   └── api-utils.js     # Global API wrappers & logging
├── scripts/             # DB Setup & maintenance scripts
└── Data.md              # Detailed Data Flow & Mapping documentation
```

---

## 🔧 Getting Started

### 1. Environment Configuration
Create a `.env` file based on `.env.example`:
```bash
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

### 2. Installation & Setup
```bash
yarn install        # Install dependencies
yarn setup:db       # Apply indexes and prepare Mongo collections
```

### 3. Development
```bash
yarn dev            # Start the Next.js dev server
```

---

## 📄 Documentation Links

- **[Technical Deep-Dive (DEV.md)](./DEV.md)**: In-depth analysis of API flows, DB performance, and frontend strategies.
- **[Data Mapping Guide (Data.md)](./Data.md)**: Comprehensive guide on ingestion rules, schema fields, and normalization steps.
