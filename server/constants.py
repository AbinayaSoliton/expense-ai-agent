EXPENSE_CATEGORIES = [
    "Costume",
    "Food",
    "Groceries",
    "Transport",
    "Utilities",
    "Rent",
    "Healthcare",
    "Entertainment",
    "Education",
    "Shopping",
    "Travel",
    "Subscriptions",
    "Dining",
    "Electronics",
    "Other",
]


CATEGORY_ALIASES = {
    "costure": "Costume",
    "costume": "Costume",
}


def canonicalize_category(value: str) -> str:
    cleaned = " ".join((value or "").split()).strip()
    if not cleaned:
        return ""
    return CATEGORY_ALIASES.get(cleaned.lower(), cleaned)
