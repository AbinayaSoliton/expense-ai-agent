from __future__ import annotations

from datetime import date
from pathlib import Path

from sqlalchemy import Date, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


# Keep DB file in the same folder as this script: server/expense_history.db
DB_PATH = Path(__file__).resolve().parent / "expense_history.db"
DATABASE_URL = f"sqlite:///{DB_PATH.as_posix()}"


class Base(DeclarativeBase):
	pass


class ExpenseHistory(Base):
	"""Stores parsed expense entries returned by the LLM pipeline."""

	__tablename__ = "expense_history"

	id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
	amount: Mapped[int] = mapped_column(Integer, nullable=False)
	category: Mapped[str] = mapped_column(String(100), nullable=False)
	merchant: Mapped[str] = mapped_column(String(150), nullable=False)
	description: Mapped[str] = mapped_column(String(500), nullable=False)
	emotion: Mapped[str] = mapped_column(String(50), nullable=False)
	necessity_score: Mapped[int] = mapped_column(Integer, nullable=False)
	date: Mapped[date] = mapped_column(Date, nullable=False)
	weekday: Mapped[str] = mapped_column(String(20), nullable=False)
	month: Mapped[str] = mapped_column(String(20), nullable=False)
	payment_mode: Mapped[str] = mapped_column(String(50), nullable=False)


engine = create_engine(
	DATABASE_URL,
	connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
	"""FastAPI dependency that provides a SQLAlchemy session."""
	db = SessionLocal()
	try:
		yield db
	finally:
		db.close()


def create_tables() -> None:
	"""Create all declared tables if they do not exist."""
	Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
	create_tables()
	print(f"SQLite database initialized at: {DB_PATH}")
