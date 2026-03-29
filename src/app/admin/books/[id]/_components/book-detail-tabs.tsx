"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { AnalysisJobsPanel } from "./analysis-jobs-panel";
import { ParseProgressPanel } from "./parse-progress-panel";
import { PersonasPanel } from "./personas-panel";

interface BookDetailTabsProps {
  bookId       : string;
  initialStatus: string;
}

type Tab = "overview" | "jobs" | "personas";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "解析进度" },
  { id: "jobs",     label: "解析任务" },
  { id: "personas", label: "人物"     }
];

export function BookDetailTabs({ bookId, initialStatus }: BookDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex border-b border-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <ParseProgressPanel
          bookId={bookId}
          initialStatus={initialStatus}
        />
      )}

      {activeTab === "jobs" && (
        <AnalysisJobsPanel bookId={bookId} />
      )}

      {activeTab === "personas" && (
        <PersonasPanel bookId={bookId} />
      )}
    </div>
  );
}
