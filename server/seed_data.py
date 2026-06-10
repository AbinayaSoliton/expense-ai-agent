"""
Seed script — inserts 100 realistic expense rows into expense_history.
Run once from the server/ directory:
    python seed_data.py
"""
from datetime import date, timedelta
import random

from database import ExpenseHistory, SessionLocal, create_tables

# ── seed data pools ──────────────────────────────────────────────────────────

EXPENSES = [
    # (category, merchant, description, emotion, necessity_score, amount_range, payment_mode)
    ("Food",          "Dominos",          "Pizza night with friends",          "Social",    2, (300, 800),  "Credit Card"),
    ("Food",          "Swiggy",           "Ordered biryani for lunch",         "Impulse",   3, (150, 450),  "UPI"),
    ("Food",          "Zomato",           "Late night snack delivery",         "Stress",    2, (100, 350),  "UPI"),
    ("Food",          "A2B Restaurant",   "Family lunch at A2B",               "Planned",   4, (600, 1400), "Debit Card"),
    ("Food",          "CCD",              "Coffee and sandwich at CCD",        "Social",    2, (200, 450),  "Credit Card"),
    ("Food",          "McDonalds",        "Quick burger meal",                 "Impulse",   2, (150, 350),  "Cash"),
    ("Food",          "Saravana Bhavan",  "South Indian meals with family",    "Planned",   4, (400, 900),  "Cash"),
    ("Food",          "Bakery",           "Bought cakes and pastries",         "Reward",    2, (100, 400),  "Cash"),

    ("Groceries",     "Bigbasket",        "Monthly grocery order",             "Planned",   5, (1200, 3500),"UPI"),
    ("Groceries",     "Zepto",            "Quick veggies and fruits order",    "Need-Based",5, (300, 800),  "UPI"),
    ("Groceries",     "Dmart",            "Weekend grocery shopping",          "Planned",   5, (800, 2000), "Debit Card"),
    ("Groceries",     "More Supermarket", "Snacks and household items",        "Planned",   4, (400, 1000), "Cash"),
    ("Groceries",     "Blinkit",          "Emergency grocery delivery",        "Urgent",    5, (200, 600),  "UPI"),

    ("Transport",     "Ola",              "Cab to office",                     "Need-Based",5, (80, 250),   "UPI"),
    ("Transport",     "Uber",             "Late night cab from party",         "Social",    3, (150, 500),  "Credit Card"),
    ("Transport",     "Auto",             "Auto ride to market",               "Need-Based",5, (40, 120),   "Cash"),
    ("Transport",     "Metro",            "Monthly metro card recharge",       "Planned",   5, (200, 500),  "UPI"),
    ("Transport",     "Rapido",           "Bike taxi to meeting",              "Planned",   4, (50, 150),   "UPI"),
    ("Transport",     "Bus",              "City bus for daily commute",        "Need-Based",5, (20, 60),    "Cash"),
    ("Transport",     "IndiGo",           "Flight tickets for travel",         "Planned",   4, (3000,8000), "Credit Card"),

    ("Entertainment", "BookMyShow",       "Movie tickets weekend",             "Reward",    2, (300, 900),  "Credit Card"),
    ("Entertainment", "Netflix",          "Monthly Netflix subscription",      "Planned",   2, (649, 649),  "Credit Card"),
    ("Entertainment", "Spotify",          "Spotify premium renewal",           "Planned",   2, (119, 119),  "Credit Card"),
    ("Entertainment", "Steam",            "Bought new game on sale",           "Impulse",   1, (500, 2500), "Credit Card"),
    ("Entertainment", "Amazon Prime",     "Prime video annual renewal",        "Planned",   2, (1499,1499), "Credit Card"),
    ("Entertainment", "PVR Cinemas",      "Movie with date",                   "Social",    2, (400, 1000), "Credit Card"),

    ("Shopping",      "Amazon",           "Electronics accessories purchase",  "Impulse",   2, (500, 3000), "Credit Card"),
    ("Shopping",      "Flipkart",         "Clothes bought during sale",        "Impulse",   2, (800, 3000), "Credit Card"),
    ("Shopping",      "Myntra",           "Casual wear during end of season",  "Impulse",   2, (600, 2000), "UPI"),
    ("Shopping",      "Meesho",           "Home decor items",                  "Impulse",   2, (200, 800),  "UPI"),
    ("Shopping",      "Local Store",      "Stationery and office supplies",    "Need-Based",4, (100, 500),  "Cash"),
    ("Shopping",      "Croma",            "Bought new earphones",              "Reward",    2, (1000,4000), "Credit Card"),

    ("Healthcare",    "Apollo Pharmacy",  "Monthly medicines",                 "Need-Based",5, (300, 1200), "UPI"),
    ("Healthcare",    "Practo",           "Doctor consultation fee",           "Urgent",    5, (300, 800),  "UPI"),
    ("Healthcare",    "Gym",              "Monthly gym membership",            "Planned",   4, (500, 1500), "UPI"),
    ("Healthcare",    "Netmeds",          "Vitamins and supplements order",    "Planned",   3, (400, 1000), "UPI"),
    ("Healthcare",    "Lab Tests",        "Blood test and health checkup",     "Need-Based",5, (500, 2000), "Cash"),

    ("Utilities",     "BSNL",             "Internet bill payment",             "Need-Based",5, (500, 1000), "UPI"),
    ("Utilities",     "TNEB",             "Electricity bill for the month",    "Need-Based",5, (800, 2500), "Net Banking"),
    ("Utilities",     "Gas Agency",       "LPG gas cylinder refill",          "Need-Based",5, (900, 950),  "Cash"),
    ("Utilities",     "Water Board",      "Monthly water bill",                "Need-Based",5, (200, 500),  "UPI"),
    ("Utilities",     "Mobile Recharge",  "Prepaid mobile recharge",           "Need-Based",5, (199, 599),  "UPI"),

    ("Education",     "Udemy",            "Online course purchase",            "Planned",   4, (399, 1299), "Credit Card"),
    ("Education",     "Coursera",         "Monthly subscription",              "Planned",   4, (1800,1800), "Credit Card"),
    ("Education",     "Books",            "Technical books from Amazon",       "Planned",   4, (500, 2000), "UPI"),
    ("Education",     "Skill share",      "Design course subscription",        "Planned",   3, (800, 800),  "Credit Card"),

    ("Travel",        "MakeMyTrip",       "Hotel booking for weekend trip",    "Planned",   3, (2000,6000), "Credit Card"),
    ("Travel",        "IRCTC",            "Train tickets home visit",          "Planned",   4, (400, 1500), "UPI"),
    ("Travel",        "OYO",              "Budget hotel stay",                 "Planned",   3, (800, 2500), "UPI"),
    ("Travel",        "Goibibo",          "Flight booked for holiday",         "Planned",   3, (4000,9000), "Credit Card"),

    ("Subscriptions", "iCloud",           "iCloud storage subscription",       "Planned",   3, (75, 219),   "Credit Card"),
    ("Subscriptions", "YouTube Premium",  "Ad-free YouTube monthly",           "Planned",   2, (129, 129),  "Credit Card"),
    ("Subscriptions", "Notion",           "Notion personal plan",              "Planned",   3, (400, 400),  "Credit Card"),

    ("Rent",          "Landlord",         "Monthly house rent",                "Need-Based",5, (8000,20000),"Net Banking"),
]

# ── date helpers ──────────────────────────────────────────────────────────────

def random_date_in_past(days: int = 180) -> date:
    offset = random.randint(0, days)
    return date.today() - timedelta(days=offset)

# ── seed function ─────────────────────────────────────────────────────────────

def seed(n: int = 100) -> None:
    create_tables()
    db = SessionLocal()

    inserted = 0
    # Cycle through the pool and pick randomly until we hit n rows
    pool = EXPENSES * 3   # enough to sample from

    try:
        for _ in range(n):
            cat, merchant, desc, emotion, necessity, (lo, hi), payment = random.choice(pool)
            amount = random.randint(lo, hi)
            exp_date = random_date_in_past(180)

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

        db.commit()
        print(f"✓ Inserted {inserted} rows into expense_history.")

        # Print summary
        from sqlalchemy import func
        total = db.query(func.count(ExpenseHistory.id)).scalar()
        print(f"  Total rows in table now: {total}")

    except Exception as exc:
        db.rollback()
        print(f"✗ Error: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed(100)
