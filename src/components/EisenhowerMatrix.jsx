import React, { useState } from "react";
import { Grid3x3 } from "lucide-react";
import { categoryChipTone, ACCENT, ACCENT_WARM, ALERT, INK } from "../constants.js";
import { fmtDate } from "../utils.js";
import { Card, Chip } from "./ui.jsx";

const QUADRANTS = [
  { key: "do", title: "Do First", subtitle: "Urgent & Important", priority: "High", importance: "High", color: ALERT, bg: "#FBEFEF" },
  { key: "schedule", title: "Schedule", subtitle: "Important, Not Urgent", priority: "Low", importance: "High", color: ACCENT, bg: "#EEF3F3" },
  { key: "delegate", title: "Delegate", subtitle: "Urgent, Not Important", priority: "High", importance: "Low", color: ACCENT_WARM, bg: "#FBF4E4" },
  { key: "eliminate", title: "Eliminate / Later", subtitle: "Neither Urgent nor Important", priority: "Low", importance: "Low", color: "rgba(0,0,0,0.35)", bg: "#F1F0EC" },
];

export default function EisenhowerMatrix({ tasks }) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const active = tasks.filter(t => t.status !== "done" && (categoryFilter === "all" || t.category === categoryFilter));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="font-serif text-2xl flex items-center gap-2" style={{ color: INK }}><Grid3x3 size={20} /> View Board</h2>
        <p className="text-sm text-black/45 mt-0.5">Eisenhower matrix — from each task's own Priority (urgency) and Importance</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[["all", "All"], ["smallBatch", "Small Batch"], ["focus", "Focus Work"], ["delegation", "Delegation & Instructions"]].map(([id, label]) => (
          <button key={id} onClick={() => setCategoryFilter(id)}
            className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium border"
            style={{ borderColor: categoryFilter === id ? INK : "rgba(0,0,0,0.1)", background: categoryFilter === id ? INK : "white", color: categoryFilter === id ? "white" : "rgba(0,0,0,0.6)" }}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QUADRANTS.map(q => {
          const items = active.filter(t => t.priority === q.priority && t.importance === q.importance);
          return (
            <Card key={q.key} className="p-4" style={{ background: q.bg }}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: INK }}>{q.title}</p>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: q.color }}>{q.subtitle}</p>
                </div>
                <span className="text-xs font-semibold" style={{ color: q.color }}>{items.length}</span>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {items.length === 0 && <p className="text-xs text-black/35">Nothing here.</p>}
                {items.map(t => (
                  <div key={t.id} className="p-2.5 rounded-lg bg-white/70">
                    <p className="text-sm" style={{ color: INK }}>{t.title}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Chip tone={categoryChipTone(t.category)}>{t.workType}</Chip>
                      <Chip tone="outline">{t.unit}</Chip>
                      {t.scheduleMode === "DEFINE" && t.date && <Chip tone="outline">{fmtDate(t.date)}</Chip>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
