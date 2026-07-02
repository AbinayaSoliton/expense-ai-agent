import React, { useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;
const ENDPOINT = `${API_BASE_URL}/expense-split`;

function LandingPage() {
  const [formData, setFormData] = useState({
    parseInput: ""
  });
  const [expenseData, setExpenseData] = useState({
    amount: "",
    category: "",
    merchant: "",
    description: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");

    const composedText = formData.parseInput;

    try {
      setIsLoading(true);
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ expense_text: composedText })
      });

      if (!response.ok) {
        throw new Error("Server request failed");
      }

      const data = await response.json();
      setExpenseData({
        amount: data.amount,
        category: data.category,
        merchant: data.merchant,
        description: data.description
      });
    } catch {
      setErrorMessage("Unable to fetch expense data from server.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Parse Input</h1>
        <form className="expense-form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <label className="full-width">
              Parse Input
              <input
                type="text"
                name="parseInput"
                value={formData.parseInput}
                onChange={handleChange}
                required
              />
            </label>
          </div>

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Submitting..." : "Send To Server"}
          </button>
        </form>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        <table className="expense-table" aria-label="Expense data table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Category</th>
              <th>Merchant</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{expenseData.amount}</td>
              <td>{expenseData.category}</td>
              <td>{expenseData.merchant}</td>
              <td>{expenseData.description}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default LandingPage;
