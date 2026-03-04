# CubeHQ Dashboard

A high-performance, agency-grade dashboard for managing client tasks, content calendars, and reporting. Built with **Next.js 14 (App Router)** and **MongoDB**, this project provides a unified interface for agency staffers and a secure, white-labeled portal for clients.

---

## 🚀 Technical Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Node.js Runtime)
- **Database**: [MongoDB Atlas](https://www.mongodb.com/) (Native Driver)
- **Authentication**: JWT-based with `httpOnly` secure cookies & Bcrypt hashing
- **State Management**: [SWR](https://swr.vercel.app/) (Stale-While-Revalidate) for real-time data fetching
- **UI Architecture**: Tailwind CSS + Radix UI (Headless) + Lucide Icons
- **Validation**: [Zod](https://zod.dev/) for strict schema enforcement
- **Invariants**: Custom Lifecycle Engine for atomic state transitions

---

## 🏗️ Core Architecture & Modules

### 1. The Lifecycle Engine (`lib/engine/lifecycle.js`)
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
├── components/
│   ├── shared/          # App-level reusable components (Pagination, ConfirmDialog…)
│   ├── table/           # Inline-edit cell components (EditableCell, LinkCell)
│   └── ui/              # Radix UI / shadcn primitives
├── lib/
│   ├── db/              # MongoDB connection + Zod schemas
│   ├── engine/          # Lifecycle engine — business rules & state transitions
│   ├── import/          # Normalization & mapping logic for CSV/Sheets import
│   └── middleware/      # withAuth, withErrorLogging, validation helpers
├── scripts/             # DB setup & maintenance scripts
└── DEV.md               # Full technical deep-dive
```

---

## 🔧 Getting Started (Local Dev — No Docker)

### 1. Environment Configuration
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
# Fill in MONGO_URL, JWT_SECRET, NEXT_PUBLIC_BASE_URL
```

### 2. Installation & Setup
```bash
yarn install        # Install dependencies
yarn setup:db       # Apply indexes and prepare Mongo collections
```

### 3. Development
```bash
yarn dev            # Start the Next.js dev server on port 3000
```

---

## � Docker Deployment

The project ships with a production-ready Docker setup. MongoDB runs on **Atlas** (not containerized).

### Local Docker Run
```bash
# 1. Fill in your .env file first (copy from .env.example)
cp .env.example .env

# 2. Build and start
docker compose up --build
```
The app will be available at `http://localhost:3000`.

---

### ☁️ AWS EC2 Deployment

#### Step 1 — Launch an EC2 Instance
- **OS**: Ubuntu 22.04 LTS
- **Instance type**: t3.small or larger (t3.micro may OOM during build)
- **Security Group**: Open inbound ports **22** (SSH) and **3000** (app)

#### Step 2 — Install Docker on the EC2 instance
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

#### Step 3 — Clone the repo and configure environment
```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd Dashboard

cp .env.example .env
nano .env
# Set: MONGO_URL, DB_NAME, JWT_SECRET, NEXT_PUBLIC_BASE_URL
```

#### Step 4 — Build and run
```bash
docker compose up -d --build
```

#### Step 5 — Verify
```bash
docker ps                            # Check container is running
docker logs cubehq_dashboard -f      # Stream logs
curl http://localhost:3000            # Smoke test
```

#### Updating the app
```bash
git pull
docker compose up -d --build         # Rebuild and restart
```

---

## 📄 Documentation Links

- **[Technical Deep-Dive (DEV.md)](./DEV.md)**: In-depth analysis of API flows, DB architecture, lifecycle engine, and frontend patterns.
