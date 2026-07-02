import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;
const HISTORY_ENDPOINT = `${BASE_URL}/expense-history`;
const CATEGORIES_ENDPOINT = `${BASE_URL}/categories`;
const BUDGET_SETTINGS_ENDPOINT = `${BASE_URL}/budget-settings`;

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatRupee(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

function monthKey(dateValue) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "";
  const mm = `${parsed.getMonth() + 1}`.padStart(2, "0");
  return `${parsed.getFullYear()}-${mm}`;
}

function normalizeName(name) {
  if (!name) return "Unknown";
  return `${name}`.trim();
}

function BudgetRow({ item, value, onChange, onCommit, onOpenUsage }) {
  const safeBudget = value > 0 ? value : 0;
  const usagePercent = safeBudget > 0 ? (item.spent / safeBudget) * 100 : 0;
  const capped = Math.min(usagePercent, 160);
  const remaining = safeBudget - item.spent;

  const tone = usagePercent > 100 ? "danger" : usagePercent > 80 ? "warn" : "ok";

  return (
    <article
      className="budget-item-card clickable"
      role="button"
      tabIndex={0}
      onClick={() => onOpenUsage(item.name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenUsage(item.name);
        }
      }}
    >
      <header className="budget-item-header">
        <div className="budget-item-icon" aria-hidden="true">
          {item.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h3>{item.name}</h3>
          <p>{item.count} expenses this month</p>
        </div>
      </header>

      <label className="budget-amount-row">
        <span>Rs</span>
        <input
          type="number"
          min="0"
          step="100"
          value={value}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onChange(item.name, toNumber(event.target.value))}
          onBlur={() => onCommit(item.name, toNumber(value))}
          aria-label={`${item.name} budget amount`}
        />
      </label>

      <div className="budget-usage-track" role="meter" aria-valuemin={0} aria-valuenow={Math.round(usagePercent)} aria-valuemax={100}>
        <div className={`budget-usage-fill ${tone}`} style={{ width: `${capped}%` }} />
      </div>

      <p className={`budget-usage-label ${tone}`}>
        {formatRupee(item.spent)} spent{" "}
        {remaining >= 0
          ? `- ${Math.round(usagePercent)}% used - ${formatRupee(remaining)} left`
          : `- ${Math.round(usagePercent)}% - over by ${formatRupee(Math.abs(remaining))}`}
      </p>

      <button
        type="button"
        className="budget-open-btn"
        onClick={(event) => {
          event.stopPropagation();
          onOpenUsage(item.name);
        }}
      >
        View Usage
      </button>
    </article>
  );
}

function BudgetTrackerPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [categories, setCategories] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function fetchHistory() {
    try {
      const response = await fetch(HISTORY_ENDPOINT);
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setErrorMessage("Unable to fetch budget data from server.");
    }
  }

  async function fetchCategories() {
    try {
      const response = await fetch(CATEGORIES_ENDPOINT);
      if (!response.ok) throw new Error("Failed to fetch categories");
      const data = await response.json();
      setCategories(Array.isArray(data.categories) ? data.categories : []);
    } catch {
      setErrorMessage("Unable to fetch categories from server.");
    }
  }

  async function fetchBudgets() {
    try {
      const response = await fetch(BUDGET_SETTINGS_ENDPOINT);
      if (!response.ok) throw new Error("Failed to fetch budget settings");
      const data = await response.json();

      if (!Array.isArray(data)) {
        setBudgets({});
        return;
      }

      const next = {};
      data.forEach((item) => {
        next[item.category] = toNumber(item.monthly_limit);
      });
      setBudgets(next);
    } catch {
      setErrorMessage("Unable to fetch budget settings from server.");
    }
  }

  async function saveBudgets(nextBudgets) {
    setIsSaving(true);
    try {
      const payload = {
        budgets: Object.entries(nextBudgets).map(([category, monthly_limit]) => ({
          category,
          monthly_limit: toNumber(monthly_limit)
        }))
      };

      const response = await fetch(BUDGET_SETTINGS_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Failed to save budgets");

      const data = await response.json();
      const normalized = {};
      data.forEach((item) => {
        normalized[item.category] = toNumber(item.monthly_limit);
      });
      setBudgets(normalized);
    } catch {
      setErrorMessage("Unable to save budgets to server.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveSingleBudget(category, amount) {
    try {
      const response = await fetch(`${BUDGET_SETTINGS_ENDPOINT}/${encodeURIComponent(category)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_limit: toNumber(amount) })
      });

      if (!response.ok) throw new Error("Failed to save budget");
    } catch {
      setErrorMessage("Unable to save budget to server.");
    }
  }

  async function syncAll() {
    setIsFetching(true);
    setErrorMessage("");
    await Promise.all([fetchHistory(), fetchCategories(), fetchBudgets()]);
    setIsFetching(false);
  }

  useEffect(() => {
    syncAll();
  }, []);

  const monthStats = useMemo(() => {
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;

    const thisMonthRows = rows.filter((row) => monthKey(row.date) === nowKey);

    const categoryMap = {};

    thisMonthRows.forEach((row) => {
      const name = normalizeName(row.category);
      if (!categoryMap[name]) {
        categoryMap[name] = { name, spent: 0, count: 0 };
      }
      categoryMap[name].spent += toNumber(row.amount);
      categoryMap[name].count += 1;
    });

    return Object.values(categoryMap).sort((a, b) => b.spent - a.spent);
  }, [rows]);

  const displayRows = useMemo(() => {
    const fromStats = monthStats;
    const known = new Set(fromStats.map((item) => item.name));

    const withBudgetOnly = categories
      .filter((name) => !known.has(name))
      .map((name) => ({ name, spent: 0, count: 0 }));

    return [...fromStats, ...withBudgetOnly];
  }, [monthStats, categories]);

  const availableToAdd = useMemo(() => {
    return categories.filter((name) => !(name in budgets));
  }, [categories, budgets]);

  function handleBudgetChange(category, amount) {
    setBudgets((prev) => ({ ...prev, [category]: amount }));
  }

  async function handleAddCategory() {
    const nextName = availableToAdd[0];
    if (!nextName) return;
    setBudgets((prev) => ({ ...prev, [nextName]: 5000 }));
    await saveSingleBudget(nextName, 5000);
  }

  async function handleSave() {
    await saveBudgets(budgets);
  }

  function handleOpenUsage(category) {
    navigate(`/budget-usage?category=${encodeURIComponent(category)}`);
  }

  return (
    <main className="page bt-shell">
      <section className="bt-card" aria-label="Monthly budgets">

        {/* ── Header ── */}
        <div className="bt-header">
          <div>
            <h1 className="bt-title">Monthly Budgets</h1>
            <p className="bt-subtitle">Resets on 1st of every month &middot; AI advisor uses these limits</p>
          </div>
          <div className="bt-header-actions">
            <button type="button" className="bt-btn-secondary" onClick={syncAll} disabled={isFetching}>
              {isFetching ? "Syncing..." : "↻ Refresh"}
            </button>
            <button type="button" className="bt-btn-primary" onClick={handleSave} disabled={isSaving || isFetching}>
              {isSaving ? "Saving..." : "Save All"}
            </button>
          </div>
        </div>

        {errorMessage && <p className="error-text">{errorMessage}</p>}

        {/* ── Tile grid ── */}
        {displayRows.length === 0 ? (
          <p className="muted-text">No category data found yet. Refresh after adding expenses.</p>
        ) : (
          <div className="bt-grid">
            {displayRows.map((item) => (
              <BudgetRow
                key={item.name}
                item={item}
                value={budgets[item.name] ?? 0}
                onChange={handleBudgetChange}
                onCommit={saveSingleBudget}
                onOpenUsage={handleOpenUsage}
              />
            ))}
          </div>
        )}

        {availableToAdd.length > 0 && (
          <button type="button" className="bt-add-btn" onClick={handleAddCategory}>
            + Add {availableToAdd[0]}
          </button>
        )}

      </section>
    </main>
  );
}

export default BudgetTrackerPage;
