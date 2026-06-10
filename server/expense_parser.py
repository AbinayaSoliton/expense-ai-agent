import os
import json
from datetime import date
from dotenv import load_dotenv
import google.genai as genai

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from database import ExpenseHistory, SessionLocal, create_tables

os.environ["SSL_CERT_FILE"] = r"C:\certs\cacert.pem"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    # allow_origins=["http://localhost:3000"], # React's default URL
    allow_origins=["http://localhost:5173", "http://localhost:8000"], # React's default URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()

# Configure SSL context with certifi certificates
# ssl_context = ssl.create_default_context(cafile=certifi.where())

# Load environment variables
load_dotenv()

# Read API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")

GEMINI_MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "1"))

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in the .env file.")

# Create Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

def_return_value = {
                    "amount": 450,
                    "category": "Lunch",
                    "merchant": "A2B",
                    "description": "Spent 450 on lunch at A2B with teammates"
                    }


class ExpenseInput(BaseModel):
    expense_text: str


class ExpenseHistoryInput(BaseModel):
    amount: int = Field(ge=0)
    category: str
    merchant: str
    description: str
    emotion: str
    necessity_score: int = Field(ge=1, le=5)
    date: date
    payment_mode: str

def parse_expense(expense_text):
    """
    Extract structured JSON from expense text.
    """

    try:
        instruction = """
        You are an AI assistant that extracts structured JSON data
        from expense descriptions.

        Return ONLY valid JSON data without any headers or extra characters 
        that is readily parsable with these keys and its values:
        amount, category, merchant, description
        """

        prompt = f"""
        {instruction}

        Expense:
        {expense_text}
        """

        response = None
        last_error = None

        for attempt in range(1, GEMINI_MAX_RETRIES + 1):
            try:
                # Generate content
                response = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=prompt,
                    config={"temperature": 0.2},
                )
                break
            except Exception as e:
                last_error = e
                err_text = str(e)
                is_quota = "RESOURCE_EXHAUSTED" in err_text or "429" in err_text

                if not is_quota or attempt == GEMINI_MAX_RETRIES:
                    raise

                print(f"Quota exceeded. Retrying ({attempt}/{GEMINI_MAX_RETRIES})...")

        if response is None and last_error is not None:
            raise last_error

        # Raw text response
        raw_text = response.text.strip()
        print("Raw model response:")
        print(raw_text)

        cleaned_raw_text = raw_text.replace("```json", "").replace("```", "").strip()
        print("Cleaned model response:")        
        print(cleaned_raw_text)

        # Convert JSON string to Python dict
        parsed_json = json.loads(cleaned_raw_text)

        return parsed_json

    except json.JSONDecodeError:
        print("Failed to parse JSON response")
        return None

    except Exception as e:
        print(f"Error: {e}")
        return None

@app.post("/expense-split")
async def get_expense_split(payload: ExpenseInput):
    expense_input = payload.expense_text
    print(f"Received expense input: {expense_input}")
    result = parse_expense(expense_input)

    if result is not None:
        print("\nParsed JSON:")
        print(result.get("category"))
        print(json.dumps(result, indent=2))
        return result
    else:
        print("No valid JSON could be parsed from the model response.")
        print(def_return_value.get("category"))
        print(json.dumps(def_return_value, indent=2))
        return def_return_value    


@app.post("/expense-history")
async def create_expense_history(payload: ExpenseHistoryInput):
    db = SessionLocal()
    try:
        expense = ExpenseHistory(
            amount=payload.amount,
            category=payload.category,
            merchant=payload.merchant,
            description=payload.description,
            emotion=payload.emotion,
            necessity_score=payload.necessity_score,
            date=payload.date,
            weekday=payload.date.strftime("%A"),
            month=payload.date.strftime("%B"),
            payment_mode=payload.payment_mode,
        )

        db.add(expense)
        db.commit()
        db.refresh(expense)

        return {
            "id": expense.id,
            "amount": expense.amount,
            "category": expense.category,
            "merchant": expense.merchant,
            "description": expense.description,
            "emotion": expense.emotion,
            "necessity_score": expense.necessity_score,
            "date": expense.date.isoformat(),
            "weekday": expense.weekday,
            "month": expense.month,
            "payment_mode": expense.payment_mode,
        }
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        db.close()

# if __name__ == "__main__":

#     expense_input = "Spent 450 on lunch at A2B with teammates"
#     result = None 
#     # result = parse_expense(expense_input)

#     if result is not None:
#         print("\nParsed JSON:")
#         print(result.get("category"))
#         print(json.dumps(result, indent=2))
#     else:
#         print("No valid JSON could be parsed from the model response.")
#         print(def_return_value.get("category"))
#         print(json.dumps(def_return_value, indent=2))
