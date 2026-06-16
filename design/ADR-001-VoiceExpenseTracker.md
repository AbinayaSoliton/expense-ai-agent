# ADR-001: Voice-Enabled Expense Tracker with AI Financial Advisor

**Status:** Proposed  
**Date:** 2026-06-16  
**Deciders:** Engineering Lead, Product Owner  
**Author:** Senior Architect (10+ yrs)

---

## Context

We need to build a personal expense tracking application with two core capabilities:

1. **Log expenses via voice** — the user speaks naturally ("spent 450 on groceries today") and the app understands, parses, and stores the expense.
2. **Ask before spending** — the user queries the app ("can I spend 3000 on a new phone?"), and the app returns a fast, LLM-generated advisory based on their historical spending patterns, current budget status, and category trends.

The tech constraints are: Python FastAPI backend, SQLite database, React frontend. The system must use MCP tools for structured LLM data access and optimize LLM calls for latency and cost.

---

## System Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        React Frontend                          │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────────┐ │
│  │ VoiceCapture│  │  ChatInterface   │  │  ExpenseDashboard │ │
│  │ (Web Speech │  │  (log + advise)  │  │  (charts/summary) │ │
│  │   API)      │  │                  │  │                   │ │
│  └──────┬──────┘  └────────┬─────────┘  └─────────┬─────────┘ │
└─────────┼──────────────────┼───────────────────────┼───────────┘
          │  WebSocket/REST  │                        │ REST
┌─────────▼──────────────────▼───────────────────────▼───────────┐
│                      FastAPI Backend                            │
│                                                                 │
│  ┌──────────────────┐   ┌──────────────────────────────────┐   │
│  │  /api/expenses   │   │       /api/advice (streaming)    │   │
│  │  /api/voice      │   │                                  │   │
│  │  /api/summary    │   │  ┌──────────────────────────┐    │   │
│  └──────────────────┘   │  │   LLM Orchestrator       │    │   │
│                         │  │   (Claude claude-haiku-4-5 / GPT-4o-mini)  │    │   │
│  ┌──────────────────┐   │  │                          │    │   │
│  │  Summary Cache   │   │  │  MCP Tool Server         │    │   │
│  │  (SQLite views + │   │  │  ┌────────────────────┐  │    │   │
│  │   agg tables)    │◄──┼──┤  │ get_summary()      │  │    │   │
│  └──────────────────┘   │  │  │ get_budget_status()│  │    │   │
│                         │  │  │ check_pattern()    │  │    │   │
│  ┌──────────────────┐   │  │  │ get_trend()        │  │    │   │
│  │  SQLite DB       │◄──┼──┤  └────────────────────┘  │    │   │
│  │  (SQLAlchemy)    │   │  └──────────────────────────┘    │   │
│  └──────────────────┘   └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Decision: Component-by-Component

---

### 1. Voice-to-Text Pipeline

**Decision: Browser-first with server-side fallback**

| Dimension | Web Speech API (primary) | OpenAI Whisper API (fallback) |
|-----------|--------------------------|-------------------------------|
| Latency | ~0ms server round-trip | ~500–1500ms |
| Cost | Free | ~$0.006/min |
| Accuracy | Good for clear speech | Excellent, multilingual |
| Offline | Yes (browser-dependent) | No |
| Control | Limited | Full |

**Primary path:** Use the browser's `window.SpeechRecognition` API — zero latency, no cost, works offline. The transcript lands in the chat input immediately.

**Fallback path:** If the browser doesn't support Web Speech API (Firefox, some mobile), send a `multipart/form-data` audio blob to `POST /api/voice/transcribe` which calls Whisper.

**NLP parsing of transcript:** A lightweight regex + LLM call extracts structured fields from the transcript. Example:

```
Input:  "spent four fifty on groceries at Big Bazaar today"
Output: { amount: 450, category: "Groceries", merchant: "Big Bazaar", date: "2026-06-16" }
```

Use a cheap/fast model (Haiku or GPT-4o-mini) with a strict JSON-schema output for this parse step — not the full advisor model.

---

### 2. Database Schema (SQLite + SQLAlchemy)

**Core tables:**

```sql
-- Main transaction table
CREATE TABLE expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    amount      REAL NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    merchant    TEXT,
    note        TEXT,
    date        DATE NOT NULL DEFAULT (date('now')),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Category master
CREATE TABLE categories (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT UNIQUE NOT NULL,    -- e.g. Groceries, Dining, Transport
    icon    TEXT                     -- emoji or icon slug
);

-- Monthly budget per category
CREATE TABLE budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    month       TEXT NOT NULL,        -- YYYY-MM  ('default' = applies to all future months)
    amount      REAL NOT NULL,
    UNIQUE(category_id, month)
);
-- Note: a row with month='default' acts as the standing budget for any month that
-- has no explicit override. On the 1st of each month a background task copies
-- 'default' rows into the new YYYY-MM rows so historical data is never mutated.

-- Pre-aggregated summary cache (updated on every expense write)
CREATE TABLE monthly_summaries (
    category_id INTEGER NOT NULL REFERENCES categories(id),
    month       TEXT NOT NULL,        -- YYYY-MM
    total_spent REAL NOT NULL DEFAULT 0,
    txn_count   INTEGER NOT NULL DEFAULT 0,
    avg_txn     REAL GENERATED ALWAYS AS (total_spent / txn_count) VIRTUAL,
    PRIMARY KEY (category_id, month)
);

-- Conversation / advice log
CREATE TABLE advice_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    query       TEXT NOT NULL,
    response    TEXT NOT NULL,
    context_json TEXT,              -- snapshot of data sent to LLM
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Key design choice:** `monthly_summaries` is updated via a SQLAlchemy event listener on every insert/update to `expenses`. This means when the LLM needs context, it reads a single pre-aggregated row per category — not a full table scan.

---

### 3. MCP Tool Server (FastAPI-embedded)

**Decision: Expose expense data as MCP tools, not raw context injection**

Rather than dumping 6 months of raw transactions into the LLM context window (expensive, slow, noisy), we expose 4 structured MCP tools the LLM can call:

```python
# Tool 1 — Financial snapshot for the LLM system prompt
@mcp_tool
def get_financial_summary(months: int = 3) -> dict:
    """Returns per-category totals and budget utilisation for the last N months."""
    # Reads from monthly_summaries — O(1) per category
    return {
        "period": "last_3_months",
        "categories": [
            { "name": "Groceries", "spent": 12400, "budget": 15000, "utilisation": 0.83 },
            { "name": "Dining",    "spent": 8200,  "budget": 6000,  "utilisation": 1.37 },
            ...
        ],
        "total_income_estimate": None,  # optional future field
        "total_spent": 42300
    }

# Tool 2 — Budget remaining right now
@mcp_tool
def get_budget_status(category: str) -> dict:
    """Returns current month's spend vs budget for a specific category."""

# Tool 3 — Similar past expenses (semantic/keyword match)
@mcp_tool
def find_similar_expenses(amount: float, category: str, tolerance: float = 0.3) -> list:
    """Finds past expenses within ±tolerance of amount in that category."""

# Tool 4 — Spending trend
@mcp_tool
def get_spending_trend(category: str, months: int = 6) -> dict:
    """Returns month-over-month delta for a category."""
    # Returns: { trend: "increasing", avg_monthly: 7200, last_month: 8200, pct_change: 13.9 }
```

**MCP server is embedded in the FastAPI process** (same process, different router prefix `/mcp`). This avoids network hops between the LLM orchestrator and the data layer.

---

### 4. LLM Orchestration — The Advisor Endpoint

**Decision: 3-layer optimisation strategy**

**Layer 1 — Model selection by task**

| Task | Model | Reason |
|------|-------|--------|
| Voice transcript → structured JSON | claude-haiku-4-5 / GPT-4o-mini | Fast, cheap, structured output |
| Financial advisor response | claude-haiku-4-5 (streaming) | ~200ms TTFB, sufficient reasoning |
| Complex multi-month analysis | claude-sonnet-4-6 | Only on explicit deep-dive request |

**Layer 2 — Context construction (the most critical optimisation)**

DO NOT inject raw expense rows. The advisor prompt is built as:

```
System:
  You are a personal finance advisor. Be concise — answer in ≤4 sentences with a Yes/No recommendation.
  [get_financial_summary(months=3)]  ← pre-fetched, not a live tool call during generation

User:
  "Can I spend ₹3,000 on a new phone case?"

Tools available during generation:
  - get_budget_status("Electronics")       ← called only if category is relevant
  - get_spending_trend("Electronics", 3)   ← called only if pattern needed
```

The system message carries pre-fetched summary (~400 tokens). The LLM calls additional tools only when it needs to drill down. This keeps average context under 800 tokens, producing sub-2s responses.

**Layer 3 — Streaming**

`POST /api/advice` returns a `text/event-stream`. The React frontend renders tokens as they arrive. Perceived latency drops to ~200ms (time-to-first-token) even if total generation takes 2s.

```
POST /api/advice
→ SSE stream: data: {"token": "Based"} ... data: {"token": " on"} ... data: [DONE]
```

---

### 5. Budget Management UI

**Gap identified:** The advisor references per-category budget limits, but without a dedicated UI the user has no way to set them. Two entry points are required.

**Entry point A — Settings → Monthly Budgets (primary)**

A full-screen settings page listing every category with an editable ₹ limit field. This is where the user initially configures all budgets. It also shows:
- Current month's spend vs the limit (progress bar + percentage)
- A global "resets on" day selector (default: 1st of month)
- An "Add category" button that creates a new row in both `categories` and `budgets` (month=`default`)
- An inline advisor hint: _"The AI advisor uses these limits when you ask 'can I spend X?'"_ — so the user understands the downstream effect

On Save, the API writes to `budgets` with `month='default'`. The backend propagates this to the current month's explicit row only if no expense has been logged yet this month (to avoid retroactively changing a month in progress).

**Entry point B — Dashboard → tap a budget card (contextual)**

Tapping any category budget card on the Dashboard drills into a single-category detail view showing:
- Large spend-vs-limit ring with over/under-budget colour coding
- Inline editable limit field (tap to edit, confirm to save)
- All transactions in that category this month
- An advisor note explaining how the current limit affects advice (e.g. "any new Electronics purchase this month will be flagged as over budget")

This path is for quick in-context corrections — e.g. the user realises their Dining budget is too tight after seeing the 137% overage on the Dashboard.

**Data flow to the advisor:**

```
User sets budget (₹5,000 for Electronics)
  → POST /api/budgets  →  budgets table (month='default')
  → background job on 1st of month copies to budgets (month='2026-07')

User asks "can I spend ₹12,000 on a keyboard?"
  → get_budget_status("Electronics")
      reads: budgets WHERE category='Electronics' AND month='2026-06'
             monthly_summaries WHERE category='Electronics' AND month='2026-06'
      returns: { limit: 5000, spent: 5800, remaining: -800, utilisation: 1.16 }
  → advisor response: "Not right now — Electronics is over budget by ₹800"
```

---

### 6. Frontend Architecture (React)

```
src/
├── components/
│   ├── VoiceButton.tsx          # Holds SpeechRecognition, shows waveform animation
│   ├── ChatWindow.tsx           # Scrollable log of expense entries + advisor replies
│   ├── ExpenseCard.tsx          # Individual expense entry with edit/delete
│   ├── AdvisorBubble.tsx        # Streaming text display with typing indicator
│   ├── Dashboard/
│   │   ├── BudgetCard.tsx       # Per-category card: spent/limit bar + tap-to-drill
│   │   ├── CategoryDetail.tsx   # Drill-down: ring chart + txn list + inline limit edit
│   │   ├── TrendLine.tsx        # Recharts LineChart: monthly trend
│   │   └── SummaryBar.tsx       # Top-level month total
│   └── Settings/
│       ├── BudgetSettings.tsx   # Full list of categories with editable ₹ limits
│       ├── BudgetRow.tsx        # Single category row: icon, name, input, progress bar
│       ├── AddCategoryModal.tsx # Create new category + set initial budget
│       └── ResetDayPicker.tsx   # Day-of-month selector for monthly reset
├── hooks/
│   ├── useVoice.ts              # Wraps Web Speech API + fallback to Whisper upload
│   ├── useAdvice.ts             # SSE streaming hook for advisor responses
│   ├── useExpenses.ts           # React Query: CRUD against /api/expenses
│   └── useBudgets.ts            # React Query: GET/PUT against /api/budgets
├── api/
│   └── client.ts                # Axios instance + endpoints
└── App.tsx
```

**State management:** React Query (TanStack Query) for server state. No Redux needed — the app is read-heavy with simple mutations.

---

### 7. API Routes Summary (FastAPI)

```
POST   /api/expenses              — create expense (from voice parse or manual)
GET    /api/expenses?month=YYYY-MM — list expenses with filters
PATCH  /api/expenses/{id}         — edit
DELETE /api/expenses/{id}         — soft delete

POST   /api/voice/transcribe      — Whisper fallback (multipart audio)
POST   /api/voice/parse           — transcript → structured expense (LLM)

POST   /api/advice                — streaming SSE advisor endpoint
GET    /api/summary?month=YYYY-MM — pre-aggregated summary for dashboard

GET    /api/budgets               — list all categories with default + current month limits
PUT    /api/budgets/{category_id} — set/update budget for a category (month defaults to 'default')
GET    /api/budgets/{category_id}?month=YYYY-MM — budget + spend for one category + month
GET    /api/budgets/reset-day     — get the configured monthly reset day
PUT    /api/budgets/reset-day     — update the reset day (triggers background propagation)

GET    /api/categories            — list all categories
POST   /api/categories            — create new category (also seeds a default budget row)
DELETE /api/categories/{id}       — soft-delete category (keeps historical expenses)

GET    /mcp/tools                 — MCP tool manifest
POST   /mcp/call                  — MCP tool invocation
```

---

## Options Considered

### Option A: Client-side only (chosen primary path for voice)
**Pros:** Zero latency, no cost, works offline.  
**Cons:** No customisation, browser-dependent support.

### Option B: PostgreSQL instead of SQLite
| Dimension | SQLite | PostgreSQL |
|-----------|--------|------------|
| Setup complexity | None | Requires server |
| Concurrent writes | Single-writer | Multi-writer |
| Full-text search | FTS5 extension | pg_trgm |
| Suitability for single-user personal app | ✅ Perfect | Overkill |

**Decision:** SQLite is correct here. This is a personal app (single user). SQLite with WAL mode handles concurrent reads fine. If multi-user is ever needed, the SQLAlchemy layer makes migration to PostgreSQL a config change.

### Option C: Stuff all expenses into LLM context
**Rejected.** 6 months of daily expenses = ~500 rows = ~8,000 tokens. At Haiku pricing that's $0.008 per query and adds ~1s latency. The MCP tool pattern keeps context under 1,000 tokens at all times.

---

## Trade-off Analysis

**Speed vs. Accuracy in voice parsing:** Web Speech API is fast but less accurate in noisy environments. The mitigation is a quick confirmation step in the UI — the parsed expense card is shown before saving, and the user taps confirm or edits. This is a UX pattern, not an architecture compromise.

**SQLite vs. scalability:** SQLite with WAL mode and proper indexing handles thousands of rows easily. The `monthly_summaries` cache table ensures the LLM context-build query is always O(categories × months), never O(transactions).

**Embedded MCP vs. separate service:** Running MCP tools in-process (same FastAPI app) trades isolation for simplicity and speed. For a personal app this is correct. If this were a multi-tenant SaaS, MCP would be extracted to its own service.

---

## Consequences

**What becomes easier:**
- Adding new expense categories requires no schema migration (just insert into `categories`)
- Switching LLM providers is a one-line config change (the orchestrator is model-agnostic via LangChain / Anthropic SDK)
- Monthly summary reports are instant — the cache table has everything precomputed

**What becomes harder:**
- Natural language queries like "show me all coffee shop visits in March" require an NL-to-SQL step or a search MCP tool — not in scope for v1
- If the user wants to share data with a spouse/partner, SQLite's single-file nature complicates sync — plan for a future SQLite-over-network layer (Turso/LibSQL) as a drop-in upgrade

**What we'll need to revisit:**
- Budget import (CSV/bank statement) — out of scope v1 but the schema supports it
- Recurring expense detection — useful future skill, needs a background scheduler (APScheduler or FastAPI lifespan task)
- On-device LLM (Phi-3/Gemma) for offline advisor mode — technically feasible once the MCP abstraction is in place

---

## Action Items

1. [ ] Scaffold FastAPI app with SQLAlchemy + Alembic migrations for the schema above
2. [ ] Seed default categories (Groceries, Dining, Transport, Electronics, Health, Other) with placeholder budgets on first run
3. [ ] Implement `monthly_summaries` update trigger as a SQLAlchemy `after_insert`/`after_update` event
4. [ ] Implement monthly budget propagation job: on 1st of month, copy `month='default'` rows to new `YYYY-MM` rows
5. [ ] Build `GET/PUT /api/budgets` and `GET/POST /api/categories` routes
6. [ ] Build MCP tool server under `/mcp` with the 4 tools defined above (ensure `get_budget_status` falls back to `month='default'` if no explicit month row exists)
7. [ ] Implement `POST /api/advice` with SSE streaming and the 3-layer LLM strategy
8. [ ] Build `BudgetSettings.tsx` + `BudgetRow.tsx` — the primary budget-setting UI under Settings tab
9. [ ] Build `CategoryDetail.tsx` — drill-down from Dashboard budget card with inline limit editing
10. [ ] Build `useBudgets.ts` React Query hook (optimistic updates so the UI responds instantly on save)
11. [ ] Build `useVoice.ts` hook with Web Speech API + Whisper fallback
12. [ ] Wire `useAdvice.ts` to the SSE stream with token-by-token rendering
13. [ ] Build Dashboard with `BudgetCard` grid + TrendLine using Recharts
14. [ ] Add WAL mode pragma to SQLite connection (`PRAGMA journal_mode=WAL`)
15. [ ] Write integration test: set budget → voice log expense → advice query reflects correct limit
16. [ ] Load test `/api/advice` endpoint: target < 300ms TTFB under normal load

---

## Folder Structure

```
expense-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app factory
│   │   ├── db/
│   │   │   ├── models.py          # SQLAlchemy ORM models
│   │   │   ├── session.py         # DB engine + session factory (WAL enabled)
│   │   │   └── migrations/        # Alembic
│   │   ├── api/
│   │   │   ├── expenses.py
│   │   │   ├── voice.py
│   │   │   ├── advice.py          # SSE streaming advisor
│   │   │   ├── summary.py
│   │   │   ├── budgets.py         # GET/PUT budget limits + reset-day config
│   │   │   └── categories.py      # CRUD for expense categories
│   │   ├── mcp/
│   │   │   ├── server.py          # MCP tool manifest + dispatcher
│   │   │   └── tools/
│   │   │       ├── financial_summary.py
│   │   │       ├── budget_status.py
│   │   │       ├── similar_expenses.py
│   │   │       └── spending_trend.py
│   │   ├── llm/
│   │   │   ├── orchestrator.py    # Builds prompt, calls model, streams response
│   │   │   ├── parser.py          # Transcript → structured expense JSON
│   │   │   └── models.py          # Pydantic schemas for LLM I/O
│   │   └── config.py              # Settings (API keys, model names, DB path)
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── hooks/
    │   ├── api/
    │   └── App.tsx
    ├── package.json
    └── vite.config.ts
```

---

*This ADR was authored by the system architect and is ready for team review.*
