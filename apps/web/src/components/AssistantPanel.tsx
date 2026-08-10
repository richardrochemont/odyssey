"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  X,
  Send,
  Loader2,
  Sparkles,
  Save,
  CheckCircle
} from "lucide-react";

interface Message {
  sender: "user" | "ai";
  text: string;
  card?: {
    intent: string;
    title: string;
    data: any;
  };
}

export default function AssistantPanel() {
  const { token, user } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expenseSavedId, setExpenseSavedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Detect context based on current path
  const getContext = () => {
    if (pathname === "/") return "portfolio";
    if (pathname.startsWith("/properties")) return "properties";
    if (pathname.startsWith("/leases")) return "tenants";
    if (pathname.startsWith("/cashflow")) return "cash_flow";
    if (pathname.startsWith("/expenses")) return "expenses";
    return "portfolio";
  };

  const contextLabels: Record<string, string> = {
    portfolio: "Portfolio Overview",
    properties: "Properties Workspace",
    tenants: "Tenants Workspace",
    cash_flow: "Cash Flow Workspace",
    expenses: "Expenses Workspace",
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Add initial greeting based on context
      const ctx = getContext();
      let greeting = "Hello, I am your Odyssey portfolio co-pilot. Ask me anything about your units, tenants, or cash flows.";
      if (ctx === "expenses") {
        greeting = "Hi! Tell me about an expense you paid (e.g. 'I paid Apex Plumbing $425 today to repair a leak at Oakridge 101') and I will draft the ledger entry for you.";
      } else if (ctx === "cash_flow") {
        greeting = "Hi! I can help you search outstanding payments, check late records, or explain cash flow trends.";
      }

      setMessages([
        {
          sender: "ai",
          text: greeting,
        },
      ]);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleToggle = () => setIsOpen((prev) => !prev);
    window.addEventListener("toggle-assistant", handleToggle);
    return () => window.removeEventListener("toggle-assistant", handleToggle);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!user) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { sender: "user", text: userText }]);
    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/ai/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          context: getContext(),
          text: userText,
        }),
      });

      if (!res.ok) throw new Error("Failed to consult AI operator");

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: data.message,
          card: data.card,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: `Sorry, I encountered an error: ${err.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // Safe manual confirmation of drafted expenses
  const handleSaveExpense = async (draft: any, msgIndex: number) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      const res = await fetch(`${apiUrl}/financials/records`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: draft.propertyId,
          unitId: draft.unitId,
          type: "expense",
          amount: draft.amount,
          date: draft.date,
          category: draft.category,
          notes: draft.memo,
        }),
      });

      if (res.ok) {
        setExpenseSavedId(msgIndex.toString());
        // Invalidate lists to refresh UI immediately
        queryClient.invalidateQueries({ queryKey: ["expenses"] });
        queryClient.invalidateQueries({ queryKey: ["trends"] });
        
        // Push a confirmation message
        setMessages((prev) => [
          ...prev,
          {
            sender: "ai",
            text: `✅ **Expense Saved Successfully!** Added $${draft.amount.toLocaleString()} for ${draft.category.replace(/_/g, " ")} to the ledger.`,
          },
        ]);
      } else {
        throw new Error("Failed to persist expense");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 bg-primary text-white p-3.5 rounded-full shadow-lg hover:bg-neutral-800 transition-all z-40 flex items-center justify-center border border-neutral-700"
        >
          <BrainCircuit className="h-6 w-6 animate-pulse" />
        </button>
      )}

      {/* Slide-out Panel */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-border shadow-2xl z-50 flex flex-col font-sans text-sm">
          {/* Header */}
          <div className="p-4 border-b border-border flex items-center justify-between bg-neutral-50">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-serif font-bold text-foreground">Odyssey Operator</h3>
                <p className="text-[10px] text-muted uppercase font-bold tracking-wider">
                  Context: {contextLabels[getContext()]}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-neutral-200 text-neutral-500 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Conversation Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-neutral-50/30">
            {messages.map((msg, idx) => {
              const isAi = msg.sender === "ai";
              return (
                <div
                  key={idx}
                  className={`flex flex-col ${isAi ? "items-start" : "items-end"}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-lg leading-relaxed text-xs ${
                      isAi
                        ? "bg-white border border-border text-foreground rounded-tl-none shadow-sm"
                        : "bg-primary text-white rounded-tr-none shadow-sm"
                    }`}
                  >
                    {msg.text}
                  </div>

                  {/* Render Structured Intent Cards */}
                  {msg.card && (
                    <div className="mt-2.5 w-full bg-white border border-border rounded-md shadow-sm p-4 text-xs font-sans">
                      <p className="font-bold border-b border-border pb-1.5 mb-2.5 text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-primary" />
                        {msg.card.title}
                      </p>

                      {/* Intent Case: Expense Capture */}
                      {msg.card.intent === "create_expense_draft" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div>
                              <p className="text-muted font-bold uppercase text-[9px] tracking-wider">Property</p>
                              <p className="font-semibold">{msg.card.data.propertyNickname}</p>
                            </div>
                            {msg.card.data.unitNumber && (
                              <div>
                                <p className="text-muted font-bold uppercase text-[9px] tracking-wider">Unit</p>
                                <p className="font-semibold">Unit {msg.card.data.unitNumber}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-muted font-bold uppercase text-[9px] tracking-wider">Amount</p>
                              <p className="font-semibold text-primary font-serif">${msg.card.data.amount.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-muted font-bold uppercase text-[9px] tracking-wider">Category</p>
                              <p className="font-semibold uppercase text-[10px]">{msg.card.data.category.replace(/_/g, ' ')}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-muted font-bold uppercase text-[9px] tracking-wider">Memo</p>
                            <p className="text-muted italic">{msg.card.data.memo}</p>
                          </div>

                          {expenseSavedId === idx.toString() ? (
                            <div className="flex items-center gap-1.5 text-xs text-primary font-bold pt-1.5 border-t border-border">
                              <CheckCircle className="h-4 w-4" /> Expense Saved
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSaveExpense(msg.card!.data, idx)}
                              className="w-full mt-2 flex items-center justify-center gap-2 py-2 bg-primary text-white text-xs font-semibold rounded hover:bg-neutral-800 shadow transition-all"
                            >
                              <Save className="h-3.5 w-3.5" /> Save operating expense
                            </button>
                          )}
                        </div>
                      )}

                      {/* Intent Case: Rent Review Opportunity */}
                      {msg.card.intent === "find_rent_opportunity" && (
                        <div className="space-y-3">
                          {msg.card.data.recommendations.map((rec: any, rIdx: number) => (
                            <div key={rIdx} className="p-2 bg-background border border-border rounded-md space-y-1 text-[11px]">
                              <p className="font-bold text-foreground">{rec.tenantName} (Unit {rec.unitNumber})</p>
                              <p className="text-muted">{rec.propertyNickname} • Expires in {rec.expiryDate}</p>
                              <div className="flex items-center justify-between font-serif pt-1">
                                <span>Current: ${rec.currentRent.toLocaleString()}</span>
                                <span className="font-bold text-primary">Range: ${rec.projectedRentMin} - ${rec.projectedRentMax}</span>
                              </div>
                              <p className="text-[9px] text-muted italic mt-1 font-sans">{rec.assumptions}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Intent Case: Outstanding Payments */}
                      {msg.card.intent === "list_outstanding_payments" && (
                        <div className="space-y-2">
                          {msg.card.data.payments.map((p: any) => (
                            <div key={p.id} className="p-2 border border-danger/25 bg-danger/5 rounded-md flex items-center justify-between text-[11px]">
                              <div>
                                <p className="font-semibold text-foreground">{p.tenantName}</p>
                                <p className="text-muted text-[10px]">{p.property} Unit {p.unit}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-danger font-serif">+${p.balance.toLocaleString()}</p>
                                <p className="text-[9px] text-muted">Due {p.dueDate}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Intent Case: Cashflow Factors */}
                      {msg.card.intent === "explain_cashflow_change" && (
                        <div className="space-y-2">
                          {msg.card.data.factors.map((f: any, fIdx: number) => (
                            <div key={fIdx} className="flex items-center justify-between text-[11px] p-1.5 border-b border-border last:border-b-0">
                              <span className="text-muted">{f.factor}</span>
                              <span className={`font-semibold font-serif ${f.impact < 0 ? "text-danger" : "text-foreground"}`}>
                                {f.impact < 0 ? "-" : "+"}${Math.abs(f.impact).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-center gap-2 text-muted text-xs font-sans pl-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input */}
          <form onSubmit={handleSend} className="p-4 border-t border-border bg-white flex items-center gap-2">
            <input
              type="text"
              required
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask operator (e.g. 'List overdue payments')..."
              className="flex-1 border border-border p-2 rounded-md outline-none text-xs focus:border-primary font-sans bg-background"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 bg-primary text-white rounded-md hover:bg-neutral-800 shadow transition-all disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
