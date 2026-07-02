"""
Seed script — inserts realistic expense rows and budget settings.

Run from server/ directory:
    python seed_data.py
"""

from __future__ import annotations

import random
from datetime import date, timedelta

from sqlalchemy import func

from constants import EXPENSE_CATEGORIES
from database import BudgetSetting, ExpenseHistory, SessionLocal, create_tables


EXPENSES = [
    # (category, merchant, description, emotion, necessity_score, amount_range, payment_mode)
    ("Food", "Dominos", "Pizza night with friends", "Social", 2, (300, 900), "Credit Card"),
    ("Food", "Swiggy", "Ordered lunch during work", "Impulse", 3, (150, 550), "UPI"),
    ("Food", "Zomato", "Dinner delivery after long day", "Stress", 2, (180, 700), "UPI"),
    ("Dining", "A2B Restaurant", "Family dinner outing", "Planned", 4, (650, 1800), "Debit Card"),
    ("Dining", "Barbeque Nation", "Weekend buffet", "Social", 3, (1200, 2800), "Credit Card"),
    ("Groceries", "Bigbasket", "Weekly groceries", "Planned", 5, (1200, 4000), "UPI"),
    ("Groceries", "Zepto", "Quick essentials delivery", "Need-Based", 5, (250, 900), "UPI"),
    ("Transport", "Ola", "Cab for office commute", "Need-Based", 5, (90, 320), "UPI"),
    ("Transport", "Metro", "Metro recharge", "Planned", 5, (200, 600), "UPI"),
    ("Utilities", "TNEB", "Electricity bill", "Need-Based", 5, (900, 2900), "Net Banking"),
    ("Utilities", "BSNL", "Internet bill payment", "Need-Based", 5, (600, 1200), "UPI"),
    ("Rent", "Landlord", "Monthly rent transfer", "Need-Based", 5, (12000, 28000), "Net Banking"),
    ("Healthcare", "Apollo Pharmacy", "Medicines and first aid", "Need-Based", 5, (300, 1700), "UPI"),
    ("Healthcare", "Practo", "Doctor consultation", "Urgent", 5, (400, 1200), "UPI"),
    ("Entertainment", "BookMyShow", "Movie tickets", "Reward", 2, (300, 1100), "Credit Card"),
    ("Entertainment", "Netflix", "Monthly OTT subscription", "Planned", 2, (649, 649), "Credit Card"),
    ("Education", "Udemy", "Online certification course", "Planned", 4, (499, 2299), "Credit Card"),
    ("Education", "Books", "Technical books and references", "Planned", 4, (450, 2400), "UPI"),
    ("Shopping", "Myntra", "Lifestyle shopping", "Impulse", 2, (700, 3800), "UPI"),
    ("Shopping", "Amazon", "Home and office accessories", "Need-Based", 3, (350, 4200), "Credit Card"),
    ("Travel", "IRCTC", "Train ticket booking", "Planned", 4, (450, 1800), "UPI"),
    ("Travel", "MakeMyTrip", "Weekend trip booking", "Planned", 3, (2500, 9000), "Credit Card"),
    ("Subscriptions", "YouTube Premium", "Monthly video subscription", "Planned", 2, (129, 129), "Credit Card"),
    ("Subscriptions", "iCloud", "Cloud storage renewal", "Planned", 3, (75, 219), "Credit Card"),
    ("Electronics", "Croma", "Bluetooth accessories", "Reward", 2, (900, 6000), "Credit Card"),
    ("Electronics", "Reliance Digital", "Appliance purchase", "Planned", 3, (2500, 18000), "Credit Card"),
    ("Costume", "Lifestyle", "Clothing purchase", "Impulse", 2, (1200, 5000), "Credit Card"),
    ("Other", "Local Store", "Miscellaneous household spend", "Need-Based", 3, (120, 1200), "Cash"),
]

# Approx monthly caps that look realistic for a salaried user.
BASE_BUDGET_LIMITS = {
    "Costume": 7000,
    "Food": 9000,
    "Groceries": 14000,
    "Transport": 7000,
    "Utilities": 9000,
    "Rent": 25000,
    "Healthcare": 7000,
    "Entertainment": 5000,
    "Education": 7000,
    "Shopping": 9000,
    "Travel": 10000,
    "Subscriptions": 2000,
    "Dining": 7000,
    "Electronics": 12000,
    "Other": 4000,
}


def _weighted_past_date(days: int = 210) -> date:
    """Bias generated data toward recent days while still covering history."""
    bucket = random.random()
    if bucket < 0.60:
        offset = random.randint(0, 30)
    elif bucket < 0.85:
        offset = random.randint(31, 90)
    else:
        offset = random.randint(91, days)
    return date.today() - timedelta(days=offset)


def _seed_expenses(db, n: int) -> int:
    inserted = 0
    for _ in range(n):
        cat, merchant, desc, emotion, necessity, (lo, hi), payment = random.choice(EXPENSES)
        amount = random.randint(lo, hi)
        exp_date = _weighted_past_date(210)

        row = ExpenseHistory(
            amount=amount,
            category=cat,
            merchant=merchant,
            description=desc,
            emotion=emotion,
            necessity_score=necessity,
            date=exp_date,
            weekday=exp_date.strftime("%A"),
            month=exp_date.strftime("%B"),
            payment_mode=payment,
        )
        db.add(row)
        inserted += 1

    # Ensure very recent activity for dashboard "live" views.
    for day_offset in range(0, 4):
        exp_date = date.today() - timedelta(days=day_offset)
        cat, merchant, desc, emotion, necessity, (lo, hi), payment = random.choice(EXPENSES)
        row = ExpenseHistory(
            amount=random.randint(lo, hi),
            category=cat,
            merchant=merchant,
            description=f"{desc} (recent)",
            emotion=emotion,
            necessity_score=necessity,
            date=exp_date,
            weekday=exp_date.strftime("%A"),
            month=exp_date.strftime("%B"),
            payment_mode=payment,
        )
        db.add(row)
        inserted += 1

    return inserted


def _upsert_budget_settings(db) -> int:
    changed = 0
    # Derive spend patterns from last 90 days to keep budgets grounded in recent activity.
    since = date.today() - timedelta(days=90)
    recent_spend = dict(
        db.query(ExpenseHistory.category, func.sum(ExpenseHistory.amount))
        .filter(ExpenseHistory.date >= since)
        .group_by(ExpenseHistory.category)
        .all()
    )

    for category in EXPENSE_CATEGORIES:
        base_limit = BASE_BUDGET_LIMITS.get(category, 5000)
        recent_total = int(recent_spend.get(category, 0) or 0)
        # Convert 90-day spend to monthly trend and keep some cushion.
        trend_limit = int((recent_total / 3) * 1.15) if recent_total > 0 else 0
        monthly_limit = max(base_limit, trend_limit)

        row = db.query(BudgetSetting).filter(BudgetSetting.category == category).first()
        if row is None:
            db.add(BudgetSetting(category=category, monthly_limit=monthly_limit))
            changed += 1
        else:
            row.monthly_limit = monthly_limit
            changed += 1

    return changed


def seed(n: int = 140) -> None:
    create_tables()
    db = SessionLocal()

    try:
        inserted_expenses = _seed_expenses(db, n)
        updated_budgets = _upsert_budget_settings(db)

        db.commit()

        total_expenses = db.query(func.count(ExpenseHistory.id)).scalar() or 0
        total_budgets = db.query(func.count(BudgetSetting.id)).scalar() or 0
        latest_date = db.query(func.max(ExpenseHistory.date)).scalar()

        print(f"Seed complete: +{inserted_expenses} expense rows inserted.")
        print(f"Budget settings upserted: {updated_budgets} categories.")
        print(f"Total expense rows: {total_expenses}")
        print(f"Total budget rows: {total_budgets}")
        print(f"Latest transaction date in DB: {latest_date}")

    except Exception as exc:
        db.rollback()
        print(f"Seeding failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed(140)
