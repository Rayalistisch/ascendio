"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

export interface SeoIssue {
  type: string;
  message: string;
  severity: "critical" | "warning" | "info";
}

export interface SeoDetails {
  issues: SeoIssue[];
  suggestions: string[];
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  if (severity === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
}

function getScoreLabel(score: number): { text: string; variant: string; className: string } {
  if (score <= 40) return { text: "Slecht", variant: "destructive", className: "" };
  if (score <= 60) return { text: "Matig", variant: "default", className: "bg-orange-500 text-white" };
  if (score <= 80) return { text: "Goed", variant: "default", className: "bg-yellow-500 text-white" };
  return { text: "Uitstekend", variant: "default", className: "bg-green-600 text-white" };
}

export function SeoScoreBadge({
  score,
  details,
}: {
  score: number | null;
  details?: SeoDetails | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (score === null || score === undefined) return <Badge variant="secondary">—</Badge>;

  const { text, variant, className } = getScoreLabel(score);
  const hasDetails = details && (details.issues.length > 0 || details.suggestions.length > 0);

  const criticalCount = details?.issues.filter((i) => i.severity === "critical").length ?? 0;
  const warningCount = details?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const infoCount = details?.issues.filter((i) => i.severity === "info").length ?? 0;

  return (
    <div className="relative" ref={containerRef}>
      <Badge
        variant={variant as "destructive" | "default" | "secondary"}
        className={cn(className, hasDetails && "cursor-pointer")}
        onMouseEnter={() => hasDetails && setOpen(true)}
        onMouseLeave={() => hasDetails && setOpen(false)}
        onClick={() => hasDetails && setOpen((v) => !v)}
      >
        {score} {text}
      </Badge>

      {open && hasDetails && (
        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-lg border bg-background p-4 shadow-lg">
          {/* Score summary */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">SEO Analyse</span>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {criticalCount > 0 && (
                <span className="flex items-center gap-0.5 text-red-500">
                  <AlertCircle className="h-3 w-3" /> {criticalCount}
                </span>
              )}
              {warningCount > 0 && (
                <span className="flex items-center gap-0.5 text-orange-500">
                  <AlertTriangle className="h-3 w-3" /> {warningCount}
                </span>
              )}
              {infoCount > 0 && (
                <span className="flex items-center gap-0.5 text-blue-500">
                  <Info className="h-3 w-3" /> {infoCount}
                </span>
              )}
            </div>
          </div>

          {/* Issues */}
          {details!.issues.length > 0 && (
            <div className="space-y-1.5">
              {details!.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <SeverityIcon severity={issue.severity} />
                  <span className="text-foreground/90">{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {details!.suggestions.length > 0 && (
            <div className={cn("space-y-1.5", details!.issues.length > 0 && "mt-3 border-t pt-3")}>
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Suggesties
              </p>
              {details!.suggestions.map((s, i) => (
                <p key={i} className="pl-5 text-xs text-foreground/80">{s}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
