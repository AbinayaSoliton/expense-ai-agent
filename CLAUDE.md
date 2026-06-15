# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

A full-stack personal-finance assistant. A FastAPI backend parses natural-language expense descriptions with Google Gemini, persists them to SQLite, and answers spending questions using the user's own history as context. A Vite + React 18 frontend drives the three workflows.

## Layout

```
server/                  FastAPI backend
  main.py                App entrypoint — CORS, router registration, table creation
  database.py            SQLAlchemy engine + ExpenseHistory model (SQLite)
  routes/
    parse_route.py       POST /expense-split  — LLM parses free-text into JSON
    history_route.py     GET/POST /expense-history — CRUD over ExpenseHistory
    advisor_route.py     POST /advisor — LLM advice grounded in DB summary
  expense_parser.py      Legacy standalone module — superseded by routes/. Do not edit unless explicitly asked
  seed_data.py           Inserts 100 randomized rows for demo / dev
  expense_history.db     Starter SQLite DB (tracked so fresh clones work)
  requirements.txt       Runtime deps (note: see "Known gaps" below)

client/                  Vite + React 18 frontend
  src/
    App.jsx              Router config (3 routes)
    main.jsx             ReactDOM root + BrowserRouter
    pages/
      LandingPage.jsx        /parseinput     — submits free text to /expense-split
      ExpenseHistoryPage.jsx /expense-history — manual form + history table
      AdvisorPage.jsx        /advisor        — Q&A panel
    components/SideNavigation.jsx
    App.css                Global styles
  agents/react-app-manager.agent.md   Project-local agent spec
```

## Run

Backend (from `server/`):
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt fastapi "uvicorn[standard]" pydantic
echo "GEMINI_API_KEY=..." > .env
uvicorn main:app --reload   # serves on http://127.0.0.1:8000
```

Frontend (from `client/`):
```bash
npm install
npm run dev                 # serves on http://localhost:5173
```

Optional seeding (from `server/`, after deps installed):
```bash
python seed_data.py         # inserts 100 randomized rows
```

## Architecture notes

- **Single SQLite file** at `server/expense_history.db`. `create_tables()` runs on FastAPI startup (`main.py:29`) so the schema is auto-applied. The file is tracked in git so a fresh clone has data to work with.
- **Gemini client** is instantiated per-route module (`routes/parse_route.py:22`, `routes/advisor_route.py:23`). Each module reads `GEMINI_API_KEY` and `GEMINI_MODEL` from `server/.env` via `load_dotenv(Path(__file__).resolve().parent.parent / ".env")`.
- **`ExpenseHistory` model** (`database.py:19`) is the only table. `weekday` and `month` are derived from `date` at write time in `routes/history_route.py:52` — keep that in sync if the schema changes.
- **Advisor context** is built in `_build_db_context` (`routes/advisor_route.py:30`): current-month spend by category, 30-day total, last 10 transactions, dominant emotion, and impulse/stress/social total. The LLM prompt caps replies to 60 words, plain text.
- **CORS** allows only `http://localhost:5173` and `http://127.0.0.1:5173` (`main.py:20`). The frontend hits `http://127.0.0.1:8000` directly — there's no proxy or env-driven base URL, so the host/port is hardcoded in each page's `fetch` call.
- **Frontend routing**: `/parseinput`, `/expense-history`, `/advisor`. Unknown paths redirect to `/parseinput` (`App.jsx:17`).

## Conventions

- Backend code uses Pydantic v2 `BaseModel` for request payloads and `sqlalchemy.exc.SQLAlchemyError` for DB error handling. Sessions are opened with `SessionLocal()` directly inside handlers and closed in `finally` — the `get_db` dependency in `database.py:45` exists but isn't currently used.
- LLM responses are stripped of ` ```json ` fences before `json.loads` (`routes/parse_route.py:76`). Keep that defensive parse when adding new LLM endpoints.
- Frontend uses functional components with hooks only; no global state library. Each page owns its fetch state.
- Indentation: backend uses **tabs** in `database.py`, spaces elsewhere — match the file you're editing.

## Known gaps (be aware before editing)

- `requirements.txt` is missing `fastapi`, `uvicorn`, and `pydantic`. They must be installed manually for the server to run. Adding them is reasonable if asked.
- `main.py:12` and `expense_parser.py:14` hardcode `SSL_CERT_FILE = r"C:\certs\cacert.pem"` — a Windows-only path that breaks on macOS/Linux unless the file happens to exist. Safe to remove on non-Windows setups, but check with the user first.
- Default `GEMINI_MODEL` is `gemini-3.1-flash-lite` (`routes/parse_route.py:16`, `routes/advisor_route.py:18`) — this model ID does not exist in the public Gemini API. Override via `.env` (e.g. `GEMINI_MODEL=gemini-2.5-flash`) or fix the default.
- `expense_parser.py` is a leftover standalone FastAPI app duplicating logic now in `routes/`. It is not wired into `main.py`. Treat it as dead code.

## When making changes

- New endpoint? Add a router under `server/routes/`, register it in `main.py`, and expose any new env var via `load_dotenv` the same way existing routes do.
- New table or column? Update `database.py`, and remember `create_tables()` only creates *missing* tables — for column changes you'll need a manual migration or to delete `expense_history.db`.
- New frontend page? Add the component under `src/pages/`, register the route in `App.jsx`, and add a `NavLink` in `components/SideNavigation.jsx`.
- Keep the hardcoded `http://127.0.0.1:8000` base URL unless the user asks to introduce env-driven config — three places use it (`LandingPage.jsx`, `ExpenseHistoryPage.jsx`, `AdvisorPage.jsx`).
