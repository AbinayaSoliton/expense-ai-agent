import os
import json
from pathlib import Path

import httpx
import google.genai as genai
from google.genai import types
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# .env sits one level up from this file (server/.env)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

router = APIRouter()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "1"))
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

_DEF_RETURN_VALUE = {
    "amount": 450,
    "category": "Lunch",
    "merchant": "A2B",
    "description": "Spent 450 on lunch at A2B with teammates",
}


class ExpenseInput(BaseModel):
    expense_text: str


def _parse_expense(expense_text: str) -> dict | None:
    instruction = """
    You are an AI assistant that extracts structured JSON data
    from expense descriptions.

    Return ONLY valid JSON data without any headers or extra characters
    that is readily parsable with these keys and its values:
    amount, category, merchant, description
    """

    prompt = f"{instruction}\n\nExpense:\n{expense_text}"

    response = None
    last_error = None

    for attempt in range(1, GEMINI_MAX_RETRIES + 1):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config={"temperature": 0.2},
            )
            break
        except Exception as exc:
            last_error = exc
            err_text = str(exc)
            is_quota = "RESOURCE_EXHAUSTED" in err_text or "429" in err_text
            if not is_quota or attempt == GEMINI_MAX_RETRIES:
                raise
            print(f"Quota exceeded. Retrying ({attempt}/{GEMINI_MAX_RETRIES})...")

    if response is None and last_error is not None:
        raise last_error

    raw_text = (response.text or "").strip()
    if not raw_text:
        raise RuntimeError("Model returned an empty response.")

    print("Raw model response:\n", raw_text)

    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    print("Cleaned model response:\n", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        print("Failed to parse JSON response")
        return None


@router.post("/expense-split")
async def get_expense_split(payload: ExpenseInput):
    print(f"Received expense input: {payload.expense_text}")
    try:
        result = _parse_expense(payload.expense_text)

        if result is not None:
            print("\nParsed JSON:\n", json.dumps(result, indent=2))
            return result

        print("No valid JSON parsed. Returning default.")
        return _DEF_RETURN_VALUE
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Expense parsing failed: {exc}") from exc
