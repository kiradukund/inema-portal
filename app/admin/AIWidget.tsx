"use client";
import { useState, useRef, useEffect } from "react";

interface Message { role: "bot" | "user"; text: string; }

const SUGGESTIONS = [
  "Who hasn't paid?",
  "Cash position",
  "Net profit",
  "Overdue loans",
  "Top risks",
  "Fabien status",
];

export default function AdminAIWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([
    { role: "bot", text: "Hello! I'm your INEMA AI Analyst 👋\n\nI have full access to your loan portfolio, payments, expenses and bank data. Ask me anything about your business." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const msgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight;
  }, [msgs]);

  async function send(text?: string) {
    const q = text ?? input;
    if (!q.trim() || loading) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json();
      setMsgs(m => [...m, { role: "bot", text: data.reply ?? "Sorry, I couldn't get a response." }]);
    } catch {
      setMsgs(m => [...m, { role: "bot", text: "Connection error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {open && (
        <div className="ai-panel">
          <div className="ai-hdr">
            <div className="ai-hdr-info">
              <div className="ai-avatar">🤖</div>
              <div>
                <div className="ai-name">INEMA AI Analyst</div>
                <div className="ai-status"><div className="tb-dot" style={{width:5,height:5}}/> Online · Full data access</div>
              </div>
            </div>
            <button className="ai-close" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="ai-msgs" ref={msgRef}>
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "bot" ? "ai-bot" : "ai-user"} style={{whiteSpace:"pre-wrap"}}>{m.text}</div>
            ))}
            {loading && <div className="ai-bot ai-thinking">Analysing your data...</div>}
          </div>
          <div className="ai-chips">
            {SUGGESTIONS.map(s => (
              <span key={s} className="ai-chip" onClick={() => send(s)}>{s}</span>
            ))}
          </div>
          <div className="ai-input-row">
            <input
              className="ai-inp"
              placeholder="Ask about your business..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
            />
            <button className="ai-send" onClick={() => send()}>➤</button>
          </div>
        </div>
      )}
      <button className="ai-btn" onClick={() => setOpen(o => !o)}>🤖</button>
    </>
  );
}
