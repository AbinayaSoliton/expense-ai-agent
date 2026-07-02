import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

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

function getMonthKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const mm = `${parsed.getMonth() + 1}`.padStart(2, "0");
  return `${parsed.getFullYear()}-${mm}`;
}

function formatDateLabel(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short"
  });
}

function getAdvisorNote(category, usagePercent, spent, limit) {
  if (limit <= 0) {
    return `Set a monthly cap for ${category} so the advisor can guide your spending decisions better.`;
  }

  if (usagePercent > 125) {
    return `Any new ${category} purchase this month is significantly over budget. Raise the cap only if this is essential, otherwise pause this category.`;
  }

  if (usagePercent > 100) {
    return `${category} has crossed this month's cap by ${formatRupee(spent - limit)}. Consider reducing optional buys until next reset.`;
  }

  if (usagePercent > 80) {
    return `${category} is nearing the limit. Keep remaining spends below ${formatRupee(limit - spent)} to stay in range.`;
  }

  return `${category} usage is healthy this month. You still have ${formatRupee(limit - spent)} available within this limit.`;
}

function BudgetUsagePage() {
  const [searchParams] = useSearchParams();
  const selectedFromUrl = searchParams.get("category") || "";

  const [rows, setRows] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(selectedFromUrl || "Electronics");
  const [categories, setCategories] = useState([]);
  const [limits, setLimits] = useState({});
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
      setErrorMessage("Unable to fetch budget usage data from server.");
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
      if (!Array.isArray(data)) return;

      const next = {};
      data.forEach((item) => {
        next[item.category] = toNumber(item.monthly_limit);
      });
      setLimits(next);
    } catch {
      setErrorMessage("Unable to fetch budget settings from server.");
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

  const monthData = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
    const thisMonthRows = rows.filter((row) => getMonthKey(row.date) === monthKey);

    const grouped = {};

    thisMonthRows.forEach((row) => {
      const category = (row.category || "Unknown").trim();
      if (!grouped[category]) {
        grouped[category] = {
          category,
          spent: 0,
          transactions: []
        };
      }

      grouped[category].spent += toNumber(row.amount);
      grouped[category].transactions.push(row);
    });

    const categoriesWithSpend = Object.values(grouped)
      .map((entry) => ({
        ...entry,
        transactions: entry.transactions.sort((a, b) => {
          const aDate = new Date(a.date).getTime() || 0;
          const bDate = new Date(b.date).getTime() || 0;
          return bDate - aDate;
        })
      }))
      .sort((a, b) => b.spent - a.spent);

    return { categoriesWithSpend, monthKey };
  }, [rows]);

  useEffect(() => {
    const options = categories.length > 0
      ? categories
      : monthData.categoriesWithSpend.map((item) => item.category);
    if (options.length === 0) return;

    if (selectedFromUrl && options.includes(selectedFromUrl) && selectedCategory !== selectedFromUrl) {
      setSelectedCategory(selectedFromUrl);
      return;
    }

    if (!options.includes(selectedCategory)) {
      setSelectedCategory(options[0]);
    }
  }, [monthData, categories, selectedCategory, selectedFromUrl]);

  const allCategories = useMemo(() => {
    if (categories.length > 0) return categories;
    return monthData.categoriesWithSpend.map((item) => item.category);
  }, [categories, monthData]);

  const activeCategory =
    monthData.categoriesWithSpend.find((item) => item.category === selectedCategory) ||
    monthData.categoriesWithSpend[0] || {
      category: selectedCategory,
      spent: 0,
      transactions: []
    };

  const monthlyLimit = toNumber(limits[activeCategory.category]);
  const usagePercent = monthlyLimit > 0 ? (activeCategory.spent / monthlyLimit) * 100 : 0;
  const overBudget = monthlyLimit > 0 && activeCategory.spent > monthlyLimit;
  const usageStatus = overBudget ? "Over budget" : "Within budget";
  const note = getAdvisorNote(
    activeCategory.category,
    usagePercent,
    activeCategory.spent,
    monthlyLimit
  );

  function handleLimitChange(event) {
    const value = toNumber(event.target.value);
    setLimits((prev) => ({ ...prev, [activeCategory.category]: value }));
  }

  async function handleUpdateLimit() {
    const category = activeCategory.category;
    const monthly_limit = toNumber(limits[category]);

    setIsSaving(true);
    try {
      const response = await fetch(`${BUDGET_SETTINGS_ENDPOINT}/${encodeURIComponent(category)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_limit })
      });

      if (!response.ok) throw new Error("Failed to save budget");
      await fetchBudgets();
    } catch {
      setErrorMessage("Unable to update budget limit in database.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="page budget-usage-shell">
      <section className="budget-usage-phone" aria-label="Budget usage details">
        <header className="budget-usage-top">
          <span className="budget-usage-path">Dashboard &gt; Tap a budget card</span>
          <button
            type="button"
            className="budget-usage-sync"
            onClick={fetchHistory}
            disabled={isFetching}
          >
            {isFetching ? "Syncing" : "Refresh"}
          </button>
        </header>

        <div className="budget-usage-title-row">
          <h1>{activeCategory.category}</h1>
          <select
            value={activeCategory.category}
            onChange={(event) => setSelectedCategory(event.target.value)}
            aria-label="Select category"
          >
            {allCategories.length === 0 ? (
              <option value={activeCategory.category}>{activeCategory.category}</option>
            ) : (
              allCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))
            )}
          </select>
        </div>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        <section className="usage-summary-card">
          <p className={overBudget ? "status-danger" : "status-safe"}>{usageStatus}</p>
          <strong>{formatRupee(activeCategory.spent)}</strong>
          <p>
            spent of {formatRupee(monthlyLimit)} limit - {Math.round(usagePercent)}%
          </p>
          <div className="usage-summary-track">
            <div
              className={overBudget ? "usage-summary-fill danger" : "usage-summary-fill safe"}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
        </section>

        <section className="budget-usage-section">
          <h2>Monthly Limit</h2>
          <div className="usage-limit-input-row">
            <span>Rs</span>
            <input type="number" min="0" step="100" value={monthlyLimit} onChange={handleLimitChange} />
          </div>
          <p className="usage-subtle">Resets on 1st day of every month</p>
        </section>

        <section className="budget-usage-section">
          <h2>This Month's Transactions</h2>
          <div className="usage-transactions-box">
            {activeCategory.transactions.length === 0 ? (
              <p className="muted-text">No transactions for this category yet.</p>
            ) : (
              activeCategory.transactions.slice(0, 5).map((row) => (
                <article key={row.id} className="usage-row">
                  <div>
                    <strong>{row.description || row.merchant || "Expense"}</strong>
                    <p>
                      {formatDateLabel(row.date)} - {row.merchant || "Unknown merchant"}
                    </p>
                  </div>
                  <span>{`-${formatRupee(toNumber(row.amount)).replace("-", "")}`}</span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="budget-usage-section">
          <h2>Advisor Note</h2>
          <div className="usage-note-box">
            <p>{note}</p>
          </div>
        </section>

        <button
          type="button"
          className="usage-update-btn"
          onClick={handleUpdateLimit}
          disabled={isSaving || isFetching}
        >
          {isSaving ? "Updating..." : "Update Budget Limit"}
        </button>
      </section>
    </main>
  );
}

export default BudgetUsagePage;
