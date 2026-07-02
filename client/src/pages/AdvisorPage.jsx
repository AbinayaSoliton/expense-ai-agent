import React, { useState } from "react";
import "../App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;

function AdvisorPage() {
  const [question, setQuestion] = useState("");
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAdvice(null);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/advisor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      setAdvice(data.advice);
    } catch (err) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="card advisor-card">
        <h1>Expense Advisor</h1>
        <form onSubmit={handleSubmit} className="advisor-form">
          <label htmlFor="advisor-question">Ask a question:</label>
          <input
            id="advisor-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Can I spend ₹2000 on a gadget this week?"
            required
          />
          <button type="submit" disabled={loading || !question.trim()}>
            {loading ? "Thinking..." : "Ask Advisor"}
          </button>
        </form>
        <div className="advisor-result">
          {error && <div className="advisor-error">{error}</div>}
          {advice && (
            <div className="advisor-advice">
              <strong>Advice:</strong>
              <p className="advisor-advice-text">{advice}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default AdvisorPage;
