import React, { useEffect, useMemo, useState } from "react";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;
const HISTORY_ENDPOINT = `${BASE_URL}/expense-history`;
const BUDGET_ENDPOINT = `${BASE_URL}/budget-settings`;

// Vibrant per-category accent colors (tile border identity, NOT bar color)
const CATEGORY_COLORS = [
  "#4ade80", "#60a5fa", "#f97316", "#a78bfa",
  "#fb7185", "#34d399", "#fbbf24", "#38bdf8",
  "#c084fc", "#f472b6", "#2dd4bf", "#e879f9",
  "#facc15", "#fb923c", "#818cf8",
];

// Emotion colors for donut chart
const EMOTION_COLORS = {
  "Planned":    "#4ade80",
  "Need-Based": "#60a5fa",
  "Impulse":    "#f87171",
  "Stress":     "#fb923c",
  "Reward":     "#a78bfa",
  "Social":     "#f472b6",
  "Urgent":     "#fbbf24",
};
const EMOTION_COLOR_FALLBACKS = [
  "#818cf8", "#2dd4bf", "#e879f9", "#facc15",
];

// Semantic bar color based on budget utilization %
function barColor(pct, limit) {
  if (limit <= 0) return "#60a5fa"; // no limit set — blue neutral
  if (pct > 100) return "#ef4444";  // over budget — red
  if (pct > 85)  return "#f97316";  // near limit  — orange
  if (pct > 60)  return "#fbbf24";  // caution     — yellow
  return "#4ade80";                  // healthy     — green
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatINR(amount) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
  return `₹${Math.round(amount)}`;
}

function formatFull(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getMonthKey(dateValue) {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "";
  const mm = `${parsed.getMonth() + 1}`.padStart(2, "0");
  return `${parsed.getFullYear()}-${mm}`;
}

function relativeDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const today = new Date();
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Category tile: accent border = vibrant category color, bar = semantic ──────
function CategoryTile({ item, budget, accentColor }) {
  const limit = toNumber(budget);
  const rawPct = limit > 0 ? (item.total / limit) * 100 : 0;
  const fillPct = Math.min(rawPct, 100);
  const bc = barColor(rawPct, limit);
  const isOver = limit > 0 && rawPct > 100;

  return (
    <article className="dash-cat-tile" style={{ borderLeft: `3px solid ${accentColor}` }}>
      <p className="dash-cat-name">{item.name}</p>
      <strong className="dash-cat-amount">{formatFull(item.total)}</strong>
      <div className="dash-cat-bar-track">
        <div className="dash-cat-bar-fill" style={{ width: `${fillPct}%`, background: bc }} />
      </div>
      <p className="dash-cat-sub" style={{ color: bc }}>
        {limit > 0
          ? isOver
            ? `Over budget · ${Math.round(rawPct)}% of ${formatINR(limit)}`
            : `${Math.round(rawPct)}% of ${formatINR(limit)} limit`
          : `${item.count} transaction${item.count !== 1 ? "s" : ""}`}
      </p>
    </article>
  );
}

// ── SVG Donut chart for emotion breakdown ──────────────────────────────────────
function DonutChart({ segments }) {
  const R = 36;
  const CX = 50;
  const CY = 50;
  const circumference = 2 * Math.PI * R;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let accumulated = 0;
  const arcs = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const dashLen = frac * circumference;
    const dashOffset = circumference * (1 - accumulated);
    accumulated += frac;
    return { ...seg, dashLen, dashOffset, pct: Math.round(frac * 100) };
  });

  return (
    <div className="donut-wrapper">
      <svg viewBox="0 0 100 100" className="donut-svg" aria-label="Emotion spending donut chart">
        {/* background track */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e2d46" strokeWidth="13" />
        {arcs.map((arc) => (
          <circle
            key={arc.name}
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={arc.color}
            strokeWidth="13"
            strokeDasharray={`${arc.dashLen} ${circumference - arc.dashLen}`}
            strokeDashoffset={arc.dashOffset}
            style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
          />
        ))}
        {/* centre label */}
        <text x="50" y="47" textAnchor="middle" className="donut-center-label" fontSize="9" fill="#8fa6cc">Total</text>
        <text x="50" y="56" textAnchor="middle" className="donut-center-value" fontSize="7.5" fill="#ffffff">
          {formatINR(total)}
        </text>
      </svg>

      <div className="donut-legend">
        {arcs.map((arc) => (
          <div key={arc.name} className="donut-legend-row">
            <span className="donut-legend-dot" style={{ background: arc.color }} />
            <span className="donut-legend-name">{arc.name}</span>
            <span className="donut-legend-pct">{arc.pct}%</span>
            <span className="donut-legend-amt">{formatINR(arc.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compact recent row ─────────────────────────────────────────────────────────
function RecentItem({ row, accentColor }) {
  const initial = (row.merchant || row.category || "?").slice(0, 1).toUpperCase();
  return (
    <article className="dash-recent-row">
      <div className="dash-recent-icon" style={{ background: accentColor + "33", color: accentColor }}>
        {initial}
      </div>
      <div className="dash-recent-info">
        <strong>{row.merchant || row.description || "Expense"}</strong>
        <p>{relativeDate(row.date)} · {row.category}</p>
      </div>
      <span className="dash-recent-amount">-{formatFull(toNumber(row.amount))}</span>
    </article>
  );
}

function ExpenseDashboardPage() {
  const [rows, setRows] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [isFetching, setIsFetching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function fetchAll() {
    setIsFetching(true);
    setErrorMessage("");
    try {
      const [histRes, budgRes] = await Promise.all([
        fetch(HISTORY_ENDPOINT),
        fetch(BUDGET_ENDPOINT),
      ]);
      if (!histRes.ok) throw new Error("Failed to fetch history");
      const histData = await histRes.json();
      setRows(Array.isArray(histData) ? histData : []);

      if (budgRes.ok) {
        const budgData = await budgRes.json();
        const map = {};
        if (Array.isArray(budgData)) {
          budgData.forEach((b) => { map[b.category] = toNumber(b.monthly_limit); });
        }
        setBudgets(map);
      }
    } catch {
      setErrorMessage("Unable to fetch dashboard data from server.");
    } finally {
      setIsFetching(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
  const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const analytics = useMemo(() => {
    const thisMonthRows = rows.filter((r) => getMonthKey(r.date) === currentMonthKey);

    // Category totals
    const catMap = {};
    thisMonthRows.forEach((r) => {
      const cat = (r.category || "Unknown").trim();
      if (!catMap[cat]) catMap[cat] = { name: cat, total: 0, count: 0 };
      catMap[cat].total += toNumber(r.amount);
      catMap[cat].count += 1;
    });
    const categoryTotals = Object.values(catMap).sort((a, b) => b.total - a.total);

    // Emotion totals with colors
    const emotionMap = {};
    thisMonthRows.forEach((r) => {
      const e = r.emotion || "Unknown";
      emotionMap[e] = (emotionMap[e] || 0) + toNumber(r.amount);
    });
    let colorFallbackIdx = 0;
    const emotionTotals = Object.entries(emotionMap)
      .map(([name, total]) => ({
        name,
        total,
        value: total,
        color: EMOTION_COLORS[name] || EMOTION_COLOR_FALLBACKS[colorFallbackIdx++ % EMOTION_COLOR_FALLBACKS.length],
      }))
      .sort((a, b) => b.total - a.total);

    const thisMonthSpend = thisMonthRows.reduce((s, r) => s + toNumber(r.amount), 0);
    const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
    const overallPct = totalBudget > 0 ? Math.round((thisMonthSpend / totalBudget) * 100) : 0;

    // Insights
    const overBudgetCategories = categoryTotals.filter((c) => {
      const lim = toNumber(budgets[c.name]);
      return lim > 0 && c.total > lim;
    });
    const impulsiveSpend = thisMonthRows
      .filter((r) => ["Impulse", "Stress", "Social"].includes(r.emotion))
      .reduce((s, r) => s + toNumber(r.amount), 0);
    const impulsivePct = thisMonthSpend > 0 ? Math.round((impulsiveSpend / thisMonthSpend) * 100) : 0;

    const recentTransactions = [...rows]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 6);

    // Category to color index map (stable order)
    const catColorMap = {};
    categoryTotals.forEach((c, i) => {
      catColorMap[c.name] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
    });

    return {
      categoryTotals, emotionTotals,
      thisMonthSpend, totalBudget, overallPct,
      overBudgetCategories, impulsiveSpend, impulsivePct,
      recentTransactions, catColorMap,
    };
  }, [rows, budgets, currentMonthKey]);

  return (
    <main className="page db-shell-wide">
      <div className="db-wide-frame">

        {/* ── Top bar: header + refresh ── */}
        <div className="db-toprow">
          <div>
            <p className="db-month">{monthLabel}</p>
            <p className="db-label">Total spent this month</p>
            <strong className="db-total">{formatFull(analytics.thisMonthSpend)}</strong>
            {analytics.totalBudget > 0 && (
              <p className="db-budget-line">
                of {formatFull(analytics.totalBudget)} budget &middot; {analytics.overallPct}%
              </p>
            )}
          </div>
          <button type="button" className="db-refresh" onClick={fetchAll} disabled={isFetching}>
            {isFetching ? "..." : "↻ Refresh"}
          </button>
        </div>

        {errorMessage && <p className="error-text">{errorMessage}</p>}

        {/* ── Insights row ── */}
        {(analytics.overBudgetCategories.length > 0 || analytics.impulsivePct > 20 || (analytics.overallPct > 90 && analytics.totalBudget > 0)) && (
          <div className="db-insights">
            {analytics.overBudgetCategories.length > 0 && (
              <div className="db-insight db-insight-danger">
                ⚠ {analytics.overBudgetCategories.map((c) => c.name).join(", ")} over budget
              </div>
            )}
            {analytics.impulsivePct > 20 && (
              <div className="db-insight db-insight-warn">
                🔥 {analytics.impulsivePct}% impulse / stress / social spend
              </div>
            )}
            {analytics.overallPct > 90 && analytics.totalBudget > 0 && (
              <div className="db-insight db-insight-warn">
                📊 {analytics.overallPct}% of monthly budget used
              </div>
            )}
          </div>
        )}

        {/* ── Two-column body ── */}
        <div className="db-body-cols">

          {/* Left: category tiles */}
          <div className="db-col-left">
            <p className="db-section-title">By Category</p>
            {analytics.categoryTotals.length === 0
              ? <p className="muted-text">No data for this month yet.</p>
              : (
                <div className="db-cat-grid-wide">
                  {analytics.categoryTotals.map((item) => (
                    <CategoryTile
                      key={item.name}
                      item={item}
                      budget={budgets[item.name] ?? 0}
                      accentColor={analytics.catColorMap[item.name]}
                    />
                  ))}
                </div>
              )}
          </div>

          {/* Right: donut + recent */}
          <div className="db-col-right">
            <p className="db-section-title">Spending by Emotion</p>
            {analytics.emotionTotals.length === 0
              ? <p className="muted-text">No data yet.</p>
              : <DonutChart segments={analytics.emotionTotals} />}

            <p className="db-section-title" style={{ marginTop: 18 }}>Recent Transactions</p>
            <div className="db-recent-list">
              {analytics.recentTransactions.length === 0
                ? <p className="muted-text">No recent transactions.</p>
                : analytics.recentTransactions.map((row) => (
                  <RecentItem
                    key={row.id}
                    row={row}
                    accentColor={analytics.catColorMap[row.category] || "#60a5fa"}
                  />
                ))}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}

export default ExpenseDashboardPage;
