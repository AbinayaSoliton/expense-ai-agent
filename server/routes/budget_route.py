from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from constants import EXPENSE_CATEGORIES, canonicalize_category
from database import BudgetSetting, ExpenseHistory, SessionLocal

router = APIRouter()


class BudgetSettingInput(BaseModel):
    category: str
    monthly_limit: int = Field(ge=0)


class BudgetSettingBulkInput(BaseModel):
    budgets: List[BudgetSettingInput]


class BudgetLimitInput(BaseModel):
    monthly_limit: int = Field(ge=0)


def _normalize_category(value: str) -> str:
    return canonicalize_category(value)


def _category_payload(db) -> list[dict]:
    default_set = {name for name in EXPENSE_CATEGORIES}

    expense_categories = {
        _normalize_category(row[0])
        for row in db.query(ExpenseHistory.category).distinct().all()
        if _normalize_category(row[0])
    }
    budget_categories = {
        _normalize_category(row.category)
        for row in db.query(BudgetSetting).all()
        if _normalize_category(row.category)
    }

    all_categories = sorted(default_set | expense_categories | budget_categories, key=str.lower)

    budget_rows = db.query(BudgetSetting).all()
    budget_map = {
        _normalize_category(row.category): row.monthly_limit
        for row in budget_rows
    }

    return [
        {
            "category": category,
            "monthly_limit": int(budget_map.get(category, 0)),
        }
        for category in all_categories
    ]


@router.get("/categories")
async def get_categories():
    db = SessionLocal()
    try:
        rows = _category_payload(db)
        return {"categories": [row["category"] for row in rows]}
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        db.close()


@router.get("/budget-settings")
async def get_budget_settings():
    db = SessionLocal()
    try:
        return _category_payload(db)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        db.close()


@router.put("/budget-settings")
async def upsert_budget_settings(payload: BudgetSettingBulkInput):
    db = SessionLocal()
    try:
        for item in payload.budgets:
            category = _normalize_category(item.category)
            if not category:
                continue

            row = db.query(BudgetSetting).filter(BudgetSetting.category == category).first()
            if row is None:
                row = BudgetSetting(category=category, monthly_limit=item.monthly_limit)
                db.add(row)
            else:
                row.monthly_limit = item.monthly_limit

        db.commit()
        return _category_payload(db)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        db.close()


@router.put("/budget-settings/{category}")
async def upsert_budget_setting(category: str, payload: BudgetLimitInput):
    normalized = _normalize_category(category)
    if not normalized:
        raise HTTPException(status_code=400, detail="Category cannot be empty.")

    db = SessionLocal()
    try:
        row = db.query(BudgetSetting).filter(BudgetSetting.category == normalized).first()
        if row is None:
            row = BudgetSetting(category=normalized, monthly_limit=payload.monthly_limit)
            db.add(row)
        else:
            row.monthly_limit = payload.monthly_limit

        db.commit()
        return {
            "category": normalized,
            "monthly_limit": payload.monthly_limit,
        }
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc
    finally:
        db.close()
