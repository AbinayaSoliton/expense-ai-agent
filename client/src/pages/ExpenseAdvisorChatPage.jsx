import React, { useEffect, useRef, useState } from "react";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;

const PARSE_ENDPOINT      = `${BASE_URL}/expense-split`;
const HISTORY_ENDPOINT    = `${BASE_URL}/expense-history`;
const ADVISOR_ENDPOINT    = `${BASE_URL}/advisor`;
const BUDGET_ENDPOINT     = `${BASE_URL}/budget-settings`;
const CATEGORIES_ENDPOINT = `${BASE_URL}/categories`;

const EMOTION_OPTIONS    = ["Planned", "Impulse", "Need-Based", "Stress", "Reward", "Social", "Urgent"];
const PAYMENT_OPTIONS    = ["UPI", "Credit Card", "Debit Card", "Cash", "Net Banking", "Wallet", "EMI"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(Number(amount) || 0);
}

/**
 * Classify the user message to decide what to do:
 *  "advisor" – they're asking if they can/should spend
 *  "expense" – they're describing a spend
 */
function detectIntent(text) {
  const lower = text.toLowerCase();
  const advisorSignals = [
    "can i", "should i", "could i", "is it ok", "is it safe", "afford",
    "worth it", "allowed", "can we", "should we", "will i", "would it be",
    "can you advise", "what do you think", "am i over",
  ];
  const expenseSignals = [
    "spent", "bought", "paid", "ordered", "purchased", "got", "ate",
    "drank", "charged", "cost me", "expense", "paid for",
  ];
  const hasAdvisor = advisorSignals.some((w) => lower.includes(w));
  const hasExpense = expenseSignals.some((w) => lower.includes(w));
  // explicit expense signals win; otherwise a question mark tips to advisor
  if (hasExpense && !hasAdvisor) return "expense";
  if (hasAdvisor) return "advisor";
  if (lower.includes("?")) return "advisor";
  return "expense";
}

let msgId = 0;
function nextId() { return ++msgId; }

// ─── Sub-components ──────────────────────────────────────────────────────────

function UserBubble({ text }) {
  return (
    <div className="chat-row chat-row-user">
      <div className="chat-bubble-user">{text}</div>
    </div>
  );
}

function SystemBubble({ children }) {
  return (
    <div className="chat-row chat-row-system">
      <div className="chat-bubble-system">{children}</div>
    </div>
  );
}

function LoadingBubble({ label }) {
  return (
    <SystemBubble>
      <span className="chat-loading">{label}</span>
    </SystemBubble>
  );
}

function ConfirmCard({ msg, categories, onSave, onDiscard }) {
  const p = msg.parsed;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    amount:          p.amount ?? "",
    category:        p.category ?? "",
    merchant:        p.merchant ?? "",
    description:     p.description ?? "",
    emotion:         p.emotion || "Planned",
    necessity_score: p.necessity_score ?? 3,
    payment_mode:    p.payment_mode || "UPI",
    date:            p.date || todayISO(),
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  const NECESSITY_LABELS = ["", "Luxury", "Optional", "Moderate", "Important", "Essential"];

  return (
    <SystemBubble>
      <p className="confirm-label">Got it — confirm before saving:</p>

      {editing ? (
        <div className="confirm-edit-grid">
          <label>Amount<input type="number" name="amount" value={form.amount} onChange={handleChange} /></label>
          <label>Category
            <select name="category" value={form.category} onChange={handleChange}>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Merchant<input type="text" name="merchant" value={form.merchant} onChange={handleChange} /></label>
          <label>Date<input type="date" name="date" value={form.date} onChange={handleChange} /></label>
          <label className="confirm-full">Description<input type="text" name="description" value={form.description} onChange={handleChange} /></label>
          <label>Emotion
            <select name="emotion" value={form.emotion} onChange={handleChange}>
              {EMOTION_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
          <label>Payment
            <select name="payment_mode" value={form.payment_mode} onChange={handleChange}>
              {PAYMENT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>Necessity (1–5)
            <input type="number" min="1" max="5" name="necessity_score" value={form.necessity_score} onChange={handleChange} />
          </label>
        </div>
      ) : (
        <table className="confirm-table">
          <tbody>
            <tr><td>Amount</td><td><strong>{formatINR(form.amount)}</strong></td></tr>
            <tr><td>Category</td><td><strong>{form.category}</strong></td></tr>
            <tr><td>Merchant</td><td><strong>{form.merchant}</strong></td></tr>
            <tr><td>Date</td><td><strong>{form.date}</strong></td></tr>
            <tr><td>Emotion</td><td><strong>{form.emotion}</strong></td></tr>
            <tr><td>Payment</td><td><strong>{form.payment_mode}</strong></td></tr>
            <tr><td>Necessity</td><td><strong>{form.necessity_score} — {NECESSITY_LABELS[form.necessity_score] || ""}</strong></td></tr>
          </tbody>
        </table>
      )}

      <div className="confirm-actions">
        <button className="confirm-btn-save" onClick={() => onSave(form)}>Save</button>
        {editing
          ? <button className="confirm-btn-edit" onClick={() => setEditing(false)}>Done editing</button>
          : <button className="confirm-btn-edit" onClick={() => setEditing(true)}>Edit</button>}
        <button className="confirm-btn-discard" onClick={onDiscard}>Discard</button>
      </div>
    </SystemBubble>
  );
}

function SavedBubble({ category, spent, limit }) {
  return (
    <SystemBubble>
      <p className="saved-line">
        ✓ Saved! <strong>{category}</strong>: {formatINR(spent)}
        {limit > 0 ? ` of ${formatINR(limit)} this month.` : " added to history."}
      </p>
    </SystemBubble>
  );
}

function AdviceBubble({ advice }) {
  const isWarning = /over|careful|avoid|wait|reduce|too much|exceeded/i.test(advice);
  return (
    <SystemBubble>
      <div className={`advice-card ${isWarning ? "advice-warn" : "advice-ok"}`}>
        <p>{advice}</p>
      </div>
    </SystemBubble>
  );
}

function ErrorBubble({ text }) {
  return (
    <SystemBubble>
      <p className="chat-error-text">{text}</p>
    </SystemBubble>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExpenseAdvisorChatPage() {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets]     = useState({});
  const [sending, setSending]     = useState(false);
  const bottomRef                 = useRef(null);
  const inputRef                  = useRef(null);

  // Fetch support data once
  useEffect(() => {
    Promise.all([
      fetch(CATEGORIES_ENDPOINT).then((r) => r.ok ? r.json() : null),
      fetch(BUDGET_ENDPOINT).then((r) => r.ok ? r.json() : null),
    ]).then(([catData, budgData]) => {
      if (catData?.categories) setCategories(catData.categories);
      if (Array.isArray(budgData)) {
        const map = {};
        budgData.forEach((b) => { map[b.category] = Number(b.monthly_limit) || 0; });
        setBudgets(map);
      }
    });
  }, []);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function pushMsg(msg) {
    setMessages((prev) => [...prev, { id: nextId(), ...msg }]);
  }

  function removeMsg(id) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  function replaceMsg(id, replacement) {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...replacement } : m));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    setSending(true);
    pushMsg({ type: "user", text });

    const intent = detectIntent(text);

    if (intent === "advisor") {
      const loadId = nextId();
      setMessages((prev) => [...prev, { id: loadId, type: "loading", label: "Thinking..." }]);
      try {
        const res = await fetch(ADVISOR_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text }),
        });
        removeMsg(loadId);
        if (!res.ok) throw new Error("Advisor request failed");
        const data = await res.json();
        pushMsg({ type: "advice", advice: data.advice });
      } catch {
        removeMsg(loadId);
        pushMsg({ type: "error", text: "Could not reach the advisor. Please try again." });
      }
    } else {
      const loadId = nextId();
      setMessages((prev) => [...prev, { id: loadId, type: "loading", label: "Parsing expense..." }]);
      try {
        const res = await fetch(PARSE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expense_text: text }),
        });
        removeMsg(loadId);
        if (!res.ok) throw new Error("Parse failed");
        const parsed = await res.json();
        pushMsg({ type: "confirm", parsed });
      } catch {
        removeMsg(loadId);
        pushMsg({ type: "error", text: "Could not parse the expense. Please try again." });
      }
    }

    setSending(false);
    inputRef.current?.focus();
  }

  async function handleSave(msgId, form) {
    // Replace confirm card with loading
    replaceMsg(msgId, { type: "loading", label: "Saving to database..." });
    try {
      const payload = {
        amount:          Number(form.amount) || 0,
        category:        form.category,
        merchant:        form.merchant,
        description:     form.description,
        emotion:         form.emotion,
        necessity_score: Number(form.necessity_score) || 3,
        date:            form.date || todayISO(),
        payment_mode:    form.payment_mode,
      };
      const res = await fetch(HISTORY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");

      // Refresh budget context for this category
      const budgRes = await fetch(BUDGET_ENDPOINT);
      let updatedBudgets = budgets;
      if (budgRes.ok) {
        const budgData = await budgRes.json();
        const map = {};
        if (Array.isArray(budgData)) {
          budgData.forEach((b) => { map[b.category] = Number(b.monthly_limit) || 0; });
          updatedBudgets = map;
          setBudgets(map);
        }
      }

      // Fetch updated monthly spend for this category
      const histRes = await fetch(HISTORY_ENDPOINT);
      let categorySpent = payload.amount;
      if (histRes.ok) {
        const hist = await histRes.json();
        const nowKey = new Date().toISOString().slice(0, 7);
        categorySpent = hist
          .filter((r) => r.category === payload.category && r.date?.startsWith(nowKey))
          .reduce((s, r) => s + (Number(r.amount) || 0), 0);
      }

      replaceMsg(msgId, {
        type: "saved",
        category: payload.category,
        spent:    categorySpent,
        limit:    updatedBudgets[payload.category] ?? 0,
      });
    } catch {
      replaceMsg(msgId, { type: "error", text: "Failed to save expense. Please try again." });
    }
  }

  function handleDiscard(msgId) {
    replaceMsg(msgId, { type: "discarded" });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <p className="chat-header-title">Expenses</p>
        <p className="chat-header-sub">Chat · Parse · Save · Advise</p>
      </header>

      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Say <em>"spent ₹450 on lunch at A2B"</em> to log an expense,<br />
              or <em>"can I spend ₹3000 on shoes?"</em> to get advice.</p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === "user")      return <UserBubble key={msg.id} text={msg.text} />;
          if (msg.type === "loading")   return <LoadingBubble key={msg.id} label={msg.label} />;
          if (msg.type === "confirm")   return (
            <ConfirmCard
              key={msg.id}
              msg={msg}
              categories={categories}
              onSave={(form) => handleSave(msg.id, form)}
              onDiscard={() => handleDiscard(msg.id)}
            />
          );
          if (msg.type === "saved")     return <SavedBubble key={msg.id} category={msg.category} spent={msg.spent} limit={msg.limit} />;
          if (msg.type === "advice")    return <AdviceBubble key={msg.id} advice={msg.advice} />;
          if (msg.type === "error")     return <ErrorBubble key={msg.id} text={msg.text} />;
          if (msg.type === "discarded") return <SystemBubble key={msg.id}><span style={{ color: "#6b7280" }}>Discarded.</span></SystemBubble>;
          return null;
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-inputbar">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="spent ₹450 on lunch... or can I spend ₹2000 on shoes?"
          disabled={sending}
          aria-label="Type your expense or question"
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          {sending ? "…" : "➤"}
        </button>
      </div>
    </div>
  );
}
