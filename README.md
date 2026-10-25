# HostelHub — Hostel Allocation & Booking System

HostelHub is a modern university hostel booking and room allocation platform. It features real-time bed availability tracking, an AI-powered room recommendation assistant, automated student booking policies, an administrative control panel, and an allocation solver engine.

🌐 **Live Deployed Application:** [https://hostel-allocation-system-inky.vercel.app/login](https://hostel-allocation-system-inky.vercel.app/login)

---

## Architecture & Tech Stack

- **Frontend (`web/`):**
  - **Framework:** React 18 with TypeScript
  - **Bundler & Tooling:** Vite
  - **Routing:** React Router DOM (v6)
  - **Styling:** Custom CSS design system inspired by boutique hostel web aesthetics (warm ivory/cream palette, jewel teal accents, Playfair Display editorial typography, responsive widescreen layout)
  - **State & Data Fetching:** Supabase JavaScript Client (`@supabase/supabase-js`)
- **Backend & Database (`supabase/`):**
  - **Database:** PostgreSQL on Supabase
  - **Security:** Row Level Security (RLS) policies and transactional database RPCs
  - **AI Assistant:** Supabase Edge Function (`ai-chat`) running Deno + Google Gemini API
- **Allocation Engine (`engine/`):**
  - **Language:** Python
  - **Solver:** Constraint-based allocation script (`allocator.py`) with `pytest` suite

---

## Features

### Student Portal
- **Real-Time Room & Bed Browser:** Browse available rooms filtered by building, view individual bed statuses, and inspect verified facility tags (`Wi-Fi`, `Study Desk`, `Attached Bathroom`, `AC`, etc.).
- **Instant Bed Booking:** Pick specific bed numbers and receive a unique booking reference.
- **AI Assistant:** Conversational search powered by Gemini to ask natural language questions (e.g., *"Find an available bed in Building A with an attached bath"*) and receive instant booking proposals.
- **Booking Management:** View active and past reservations, with cancellation rules enforced according to the institutional cutoff policy.

### Admin Dashboard & Management
- **Occupancy Overview:** Real-time statistics on total buildings, rooms, active beds, and current occupancy percentage with visual progress tracking.
- **Inventory Creation:** Forms to quickly add buildings and create rooms with dynamic bed capacities.
- **All Bookings Explorer:** Debounced search across booking references, student names, student numbers, and room numbers with status filtering (`Active` / `Cancelled`) and pagination.
- **Academic Calendar Settings:** Configure college start dates, cancellation lead times (in days), and local timezones with a dynamic cancellation cutoff preview.

---

## Project Structure

```text
├── engine/
│   └── allocator.py          # Python allocation solver and unit tests
├── supabase/
│   ├── functions/
│   │   └── ai-chat/          # Supabase Edge function for Gemini chat
│   └── migrations/
│       ├── 0001_init.sql             # Base schemas, tables, and constraints
│       ├── 0002_frontend_rpcs.sql    # Availability, booking, and taken bed RPCs
│       ├── 0003_fix_booking.sql      # Concurrency fixes and transactional booking RPC
│       ├── 0004_ai_proposals.sql     # AI proposal creation and expiration logic
│       └── 0005_admin_tools.sql      # Admin RPCs: building/room upsert & search
└── web/
    ├── src/
    │   ├── pages/            # View components (Rooms, Login, MyBookings, Admin, etc.)
    │   ├── components.tsx    # Shared UI: SVG facility chips, bed meters, skeleton loaders
    │   ├── lib.ts            # Supabase client initialization & error helper
    │   ├── styles.css        # Design system styles
    │   ├── App.tsx           # Router, route guards, and navigation header
    │   └── main.tsx          # React application root
    └── tests/                # Frontend integration test suite
```

---

## Getting Started

### 1. Database Setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and execute the migration scripts in sequential order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_frontend_rpcs.sql`
   - `supabase/migrations/0003_fix_booking.sql`
   - `supabase/migrations/0004_ai_proposals.sql`
   - `supabase/migrations/0005_admin_tools.sql`
3. *(Optional)* Run seed data to populate demo buildings, rooms, and facilities.

### 2. Frontend Setup

1. Navigate to the `web` directory:
   ```bash
   cd web
   ```
2. Copy the example environment file and provide your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
   Configure `.env` with:
   ```env
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-key>
   ```
3. Install dependencies and start the development server:
   ```bash
   npm install
   npm run dev
   ```

### 3. Promoting an Admin Account

Register a new user account through the web interface (or Supabase Auth). Once registered, open the Supabase SQL editor and promote the profile to admin:

```sql
UPDATE profiles
SET role = 'admin'
WHERE student_number = '<your_student_number>';
```

Refresh the web app to access the **Dashboard**, **All Bookings**, and **Settings** tabs.

### 4. Deploying the AI Assistant (Edge Function)

1. Set your Gemini API key in Supabase secrets:
   ```bash
   supabase secrets set GEMINI_API_KEY=<your_gemini_api_key>
   ```
2. Deploy the Edge function:
   ```bash
   supabase functions deploy ai-chat
   ```

---

## Testing

### Frontend Tests
Run Vitest integration tests in the `web` directory:
```bash
cd web
npm test
```

### Allocation Engine Tests
Run pytest on the Python allocation module:
```bash
pytest engine/allocator.py
```

### Production Build
To verify production TypeScript compilation and bundling:
```bash
cd web
npm run build
```