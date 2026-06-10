import React, { useState } from "react";

const BASE_URL = "http://127.0.0.1:8000";
const HISTORY_ENDPOINT = `${BASE_URL}/expense-history`;

const INITIAL_STATE = {
  amount: "",
  category: "",
  merchant: "",
  description: "",
  emotion: "",
  necessity_score: "",
  date: "",
  payment_mode: ""
};

const CATEGORY_OPTIONS = [
  "Costure",
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
  "Other"
];

const EMOTION_OPTIONS = [
  "Planned",
  "Impulse",
  "Need-Based",
  "Stress",
  "Reward",
  "Social",
  "Urgent"
];

const PAYMENT_MODE_OPTIONS = [
  "Cash",
  "Debit Card",
  "Credit Card",
  "UPI",
  "Net Banking",
  "Wallet",
  "EMI"
];

const HISTORY_TABLE_HEADERS = [
  "ID", "Amount", "Category", "Merchant", "Description",
  "Emotion", "Necessity", "Date", "Weekday", "Month", "Payment Mode"
];

function HistoryTable({ rows }) {
  if (rows.length === 0) {
    return <p className="error-text" style={{ color: "#64748b" }}>No records found in database.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="expense-table" aria-label="Expense history table">
        <thead>
          <tr>
            {HISTORY_TABLE_HEADERS.map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.amount}</td>
              <td>{row.category}</td>
              <td>{row.merchant}</td>
              <td>{row.description}</td>
              <td>{row.emotion}</td>
              <td>{row.necessity_score}</td>
              <td>{row.date}</td>
              <td>{row.weekday}</td>
              <td>{row.month}</td>
              <td>{row.payment_mode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseHistoryPage() {
  const [formData, setFormData] = useState(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [historyRows, setHistoryRows] = useState([]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function fetchHistory() {
    setIsFetching(true);
    try {
      const response = await fetch(HISTORY_ENDPOINT);
      if (!response.ok) throw new Error("Failed to fetch history");
      const data = await response.json();
      setHistoryRows(data);
    } catch {
      setErrorMessage("Unable to fetch expense history from server.");
    } finally {
      setIsFetching(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    const payload = {
      amount: Number(formData.amount),
      category: formData.category,
      merchant: formData.merchant,
      description: formData.description,
      emotion: formData.emotion,
      necessity_score: Number(formData.necessity_score),
      date: formData.date,
      payment_mode: formData.payment_mode
    };

    try {
      setIsLoading(true);
      const response = await fetch(HISTORY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Server request failed");

      setFormData(INITIAL_STATE);
      await fetchHistory();
    } catch {
      setErrorMessage("Unable to save expense history to server.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Expense History Input</h1>
        <form className="expense-form" onSubmit={handleSubmit}>
          <div className="field-grid history-grid">
            <label>
              Amount
              <input
                type="number"
                min="0"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Category
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
              >
                <option value="">Select category</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Merchant
              <input
                type="text"
                name="merchant"
                value={formData.merchant}
                onChange={handleChange}
                required
              />
            </label>

            <label className="full-width">
              Description
              <input
                type="text"
                name="description"
                value={formData.description}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Emotion
              <select
                name="emotion"
                value={formData.emotion}
                onChange={handleChange}
                required
              >
                <option value="">Select emotion</option>
                {EMOTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Necessity Score
              <input
                type="number"
                min="1"
                max="5"
                name="necessity_score"
                value={formData.necessity_score}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Date
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Payment Mode
              <select
                name="payment_mode"
                value={formData.payment_mode}
                onChange={handleChange}
                required
              >
                <option value="">Select payment mode</option>
                {PAYMENT_MODE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save To History"}
          </button>
        </form>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        <div className="history-header">
          <h2>All Expense Records</h2>
          <button
            type="button"
            className="btn-refresh"
            onClick={fetchHistory}
            disabled={isFetching}
          >
            {isFetching ? "Loading..." : "Refresh"}
          </button>
        </div>

        <HistoryTable rows={historyRows} />
      </section>
    </main>
  );
}

export default ExpenseHistoryPage;
