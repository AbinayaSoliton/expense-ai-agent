import os
from datetime import date
from pathlib import Path

import httpx
import google.genai as genai
from google.genai import types
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func

from database import ExpenseHistory, SessionLocal

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

router = APIRouter()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_SSL_VERIFY = os.getenv("GEMINI_SSL_VERIFY", "true").lower() != "false"

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in the .env file.")

_http_options = None
if not GEMINI_SSL_VERIFY:
    _http_options = types.HttpOptions(
        httpx_client=httpx.Client(verify=False),
        httpx_async_client=httpx.AsyncClient(verify=False),
    )

client = genai.Client(api_key=GEMINI_API_KEY, http_options=_http_options)


class AdvisorInput(BaseModel):
    question: str


def _build_db_context(db) -> str:
    """
    Builds a concise financial context string from the DB:
    - Current month spend by category
    - Last 30-day total
    - Last 10 transactions
    - Top emotion and payment mode this month
    """
    today = date.today()
    current_month = today.strftime("%B")
    current_year = today.year

    # Monthly spend per category (current month)
    monthly = (
        db.query(ExpenseHistory.category, func.sum(ExpenseHistory.amount))
        .filter(
            ExpenseHistory.month == current_month,
            func.strftime("%Y", ExpenseHistory.date) == str(current_year),
        )
        .group_by(ExpenseHistory.category)
        .order_by(func.sum(ExpenseHistory.amount).desc())
        .all()
    )

    # Total spend last 30 days
    from datetime import timedelta
    since = today - timedelta(days=30)
    total_30d = (
        db.query(func.sum(ExpenseHistory.amount))
        .filter(ExpenseHistory.date >= since)
        .scalar()
        or 0
    )

    # Last 10 transactions
    recent = (
        db.query(ExpenseHistory)
        .order_by(ExpenseHistory.date.desc(), ExpenseHistory.id.desc())
        .limit(10)
        .all()
    )

    # Dominant emotion this month
    top_emotion = (
        db.query(ExpenseHistory.emotion, func.count(ExpenseHistory.emotion))
        .filter(
            ExpenseHistory.month == current_month,
            func.strftime("%Y", ExpenseHistory.date) == str(current_year),
        )
        .group_by(ExpenseHistory.emotion)
        .order_by(func.count(ExpenseHistory.emotion).desc())
        .first()
    )

    # Impulse spend this month
    impulse_total = (
        db.query(func.sum(ExpenseHistory.amount))
        .filter(
            ExpenseHistory.emotion.in_(["Impulse", "Stress", "Social"]),
            ExpenseHistory.month == current_month,
            func.strftime("%Y", ExpenseHistory.date) == str(current_year),
        )
        .scalar()
        or 0
    )

    # Format context string
    lines = [
        f"Today: {today.strftime('%A, %d %B %Y')}",
        f"\n--- Spending this month ({current_month} {current_year}) by category ---",
    ]
    if monthly:
        for cat, total in monthly:
            lines.append(f"  {cat}: ₹{total:,}")
    else:
        lines.append("  No spending recorded this month yet.")

    lines.append(f"\n--- Last 30 days total spend: ₹{total_30d:,} ---")
    lines.append(f"Impulse/Stress/Social spend this month: ₹{impulse_total:,}")

    if top_emotion:
        lines.append(f"Most frequent emotion this month: {top_emotion[0]} ({top_emotion[1]} times)")

    lines.append(f"\n--- Last 10 transactions ---")
    for t in recent:
        lines.append(
            f"  [{t.date}] {t.category} | {t.merchant} | ₹{t.amount} | {t.emotion} | necessity={t.necessity_score}"
        )

    return "\n".join(lines)


def _ask_llm(question: str, context: str) -> str:
    prompt = f"""
You are a personal finance advisor AI. You have access to the user's recent expense history below.

{context}

The user is asking:
"{question}"

Based on the spending history above, give a clear, honest recommendation.
Your response must include:
1. A direct YES or NO recommendation on whether they should make the expense.
2. The reasoning based on their actual spending patterns.
3. Any specific concern (e.g. too much impulse buying, high spend in that category, end of month).
4. A practical suggestion or alternative if you recommend against it.

Be extremely concise and to the point. Answer in 2-3 short sentences or bullet points. Do not exceed 60 words. Use plain text, no markdown.
"""

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config={"temperature": 0.4},
    )
    return response.text.strip()


@router.post("/advisor")
async def expense_advisor(payload: AdvisorInput):
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    # DEBUG: Return stub response to test CSS wrapping without consuming LLM tokens.
    # Remove this block and uncomment the real call below when done debugging.
    # return {
    #     "question": payload.question,
    #     "advice": "NO. You have already spent ₹17,840 this month, with ₹6,266 on Food alone. Adding ₹5,000 on a dress would push your Shopping spend significantly higher. Consider waiting until next month or setting a strict budget limit for clothing purchases."
    # }

    db = SessionLocal()
    try:
        context = _build_db_context(db)
        print("DB context built:\n", context)
        advice = _ask_llm(payload.question, context)
        print("LLM advice:\n", advice)
        return {"question": payload.question, "advice": advice}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        db.close()
