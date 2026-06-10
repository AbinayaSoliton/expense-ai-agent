from datetime import date
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from database import ExpenseHistory, SessionLocal

router = APIRouter()


class ExpenseHistoryInput(BaseModel):
    amount: int = Field(ge=0)
    category: str
    merchant: str
    description: str
    emotion: str
    necessity_score: int = Field(ge=1, le=5)
    date: date
    payment_mode: str


def _row_to_dict(expense: ExpenseHistory) -> dict:
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


@router.post("/expense-history")
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
        print(f"Saved expense ID {expense.id} to database.")
        return _row_to_dict(expense)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        db.close()


@router.get("/expense-history")
async def get_expense_history():
    db = SessionLocal()
    try:
        rows = db.query(ExpenseHistory).order_by(ExpenseHistory.id.desc()).all()
        return [_row_to_dict(row) for row in rows]
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        db.close()
