"""
One-time data cleanup script.

Renames legacy misspelled category values from "Costure" to "Costume"
in both expense_history and budget_settings tables.

Run from server/ directory:
    python cleanup_categories.py
"""

from __future__ import annotations

from sqlalchemy import update

from database import BudgetSetting, ExpenseHistory, SessionLocal, create_tables


def cleanup_category_spelling() -> None:
    create_tables()
    db = SessionLocal()

    try:
        expense_updated = (
            db.query(ExpenseHistory)
            .filter(ExpenseHistory.category == "Costure")
            .update({ExpenseHistory.category: "Costume"}, synchronize_session=False)
        )

        budget_updated = (
            db.query(BudgetSetting)
            .filter(BudgetSetting.category == "Costure")
            .update({BudgetSetting.category: "Costume"}, synchronize_session=False)
        )

        db.commit()

        print(f"Expense rows updated: {expense_updated}")
        print(f"Budget rows updated: {budget_updated}")
        print("Category cleanup complete.")
    except Exception as exc:
        db.rollback()
        print(f"Category cleanup failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    cleanup_category_spelling()
