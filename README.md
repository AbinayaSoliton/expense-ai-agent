# expense-ai-agent

*Your AI financial partner.* A personal-finance assistant that parses free-text expenses, tracks your spending, and answers questions like *"can I afford this?"* — grounded in your actual transaction history.

Powered by Google Gemini, FastAPI, and React.

---

## Features

- **Parse Input** — type "spent 450 on lunch at A2B with teammates", get back structured `{amount, category, merchant, description}`.
- **Expense History** — log expenses with emotion (`Planned`, `Impulse`, `Stress`, `Reward`, ...) and necessity score (1–5). Browse every record in a table.
- **Expense Advisor** — ask a free-form question and get a 60-word YES/NO recommendation that cites your real spending: month-to-date by category, 30-day total, dominant emotion, and impulse spend.

## Stack

| Layer    | Tech                                                    |
| -------- | ------------------------------------------------------- |
| Backend  | Python 3.11+, FastAPI, SQLAlchemy 2, SQLite             |
| LLM      | Google Gemini via `google-genai`                        |
| Frontend | React 18, React Router 6, Vite 5                        |

## Project layout

```
expense-ai-agent/
├── server/        FastAPI app — routes, SQLAlchemy model, seed script
├── client/        Vite + React frontend
├── CLAUDE.md      Repo guide for Claude Code
└── README.md
```

A starter SQLite database (`server/expense_history.db`) is committed so you can run the UI immediately after install.

## Prerequisites

- Python **3.11+**
- Node **18+** and npm
- A Gemini API key — get one at <https://aistudio.google.com/apikey>

## Setup

### 1. Backend

```bash
cd server
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate

# requirements.txt covers google-genai / dotenv / sqlalchemy.
# FastAPI stack is installed separately for now:
pip install -r requirements.txt fastapi "uvicorn[standard]" pydantic
```

Create `server/.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash        # optional; override the default
GEMINI_MAX_RETRIES=1                 # optional
```

Run the API:

```bash
uvicorn main:app --reload
# → http://127.0.0.1:8000
# Interactive docs: http://127.0.0.1:8000/docs
```

(Optional) Seed 100 randomized rows for demo data:

```bash
python seed_data.py
```

### 2. Frontend

```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

Open <http://localhost:5173> — you'll land on **Parse Input**. The right-side nav switches between the three views.

## API

Base URL: `http://127.0.0.1:8000`

| Method | Endpoint           | Body                                                       | Description                                                 |
| ------ | ------------------ | ---------------------------------------------------------- | ----------------------------------------------------------- |
| POST   | `/expense-split`   | `{ "expense_text": "..." }`                                | LLM extracts `{amount, category, merchant, description}`.   |
| POST   | `/expense-history` | `{amount, category, merchant, description, emotion, necessity_score, date, payment_mode}` | Save a row to SQLite.                |
| GET    | `/expense-history` | —                                                          | List all expenses, newest first.                            |
| POST   | `/advisor`         | `{ "question": "..." }`                                    | Returns `{question, advice}` — a 60-word recommendation.    |

Example:

```bash
curl -X POST http://127.0.0.1:8000/advisor \
  -H "Content-Type: application/json" \
  -d '{"question":"Can I spend ₹2000 on a gadget this week?"}'
```

## Data model

Single table, `expense_history`:

| Column            | Type        | Notes                                  |
| ----------------- | ----------- | -------------------------------------- |
| `id`              | INTEGER PK  | autoincrement                          |
| `amount`          | INTEGER     | rupees (no decimals)                   |
| `category`        | VARCHAR(100)|                                        |
| `merchant`        | VARCHAR(150)|                                        |
| `description`     | VARCHAR(500)|                                        |
| `emotion`         | VARCHAR(50) | `Planned`, `Impulse`, `Stress`, ...    |
| `necessity_score` | INTEGER     | 1 (luxury) – 5 (essential)             |
| `date`            | DATE        |                                        |
| `weekday`         | VARCHAR(20) | derived from `date` at write time      |
| `month`           | VARCHAR(20) | derived from `date` at write time      |
| `payment_mode`    | VARCHAR(50) | `Cash`, `UPI`, `Credit Card`, ...      |

## Troubleshooting

- **`GEMINI_API_KEY is not set`** — the server reads `server/.env`. Make sure the file is in `server/`, not the repo root.
- **`SSL_CERT_FILE` errors** — `server/main.py` sets a hardcoded Windows cert path. On macOS/Linux either create the file, comment that line out, or override the env var.
- **CORS errors in the browser** — the API only allows `http://localhost:5173` and `http://127.0.0.1:5173`. Run the Vite dev server on its default port.
- **Unknown model** — `gemini-3.1-flash-lite` is the default in code but isn't a real model ID. Set `GEMINI_MODEL=gemini-2.5-flash` (or another current model) in `.env`.
- **Schema drift after editing `database.py`** — `create_tables()` only creates *missing* tables. To pick up column changes, delete `server/expense_history.db` and reseed.
