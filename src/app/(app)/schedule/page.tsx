"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

interface Site {
  id: string;
  name: string;
  wp_base_url: string;
}

interface Schedule {
  id: string;
  site_id: string;
  rrule: string;
  timezone: string;
  is_enabled: boolean;
  next_run_at: string | null;
  created_at: string;
  asc_sites: { name: string; wp_base_url: string } | null;
}

const FREQUENCIES = [
  { value: "daily", label: "Dagelijks" },
  { value: "weekly", label: "Wekelijks" },
  { value: "biweekly", label: "Tweewekelijks" },
  { value: "monthly", label: "Maandelijks" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function formatFrequency(rrule: string): string {
  if (rrule.includes("DAILY")) return "Dagelijks";
  if (rrule.includes("WEEKLY") && rrule.includes("INTERVAL=2"))
    return "Tweewekelijks";
  if (rrule.includes("WEEKLY")) return "Wekelijks";
  if (rrule.includes("MONTHLY")) return "Maandelijks";
  return "Onbekend";
}

function formatDateTime(dateString: string | null): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractTimeFromRRule(rrule: string): string {
  const hourMatch = rrule.match(/BYHOUR=(\d+)/);
  const minuteMatch = rrule.match(/BYMINUTE=(\d+)/);
  const hour = hourMatch ? hourMatch[1].padStart(2, "0") : "00";
  const minute = minuteMatch ? minuteMatch[1].padStart(2, "0") : "00";
  return `${hour}:${minute}`;
}

export default function SchedulePage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sitesRes, schedulesRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/schedules"),
      ]);
      const sitesData = await sitesRes.json();
      const schedulesData = await schedulesRes.json();
      setSites(sitesData.sites ?? []);
      setSchedules(schedulesData.schedules ?? []);

      // Set default site
      if (sitesData.sites?.length > 0 && !selectedSiteId) {
        setSelectedSiteId(sitesData.sites[0].id);
      }
    } catch {
      // Silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleToggle(scheduleId: string, isEnabled: boolean) {
    // Optimistic update
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === scheduleId ? { ...s, is_enabled: isEnabled } : s
      )
    );

    try {
      const res = await fetch("/api/schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scheduleId, isEnabled }),
      });

      if (!res.ok) {
        // Revert on failure
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === scheduleId ? { ...s, is_enabled: !isEnabled } : s
          )
        );
      }
    } catch {
      // Revert on error
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === scheduleId ? { ...s, is_enabled: !isEnabled } : s
        )
      );
    }
  }

  async function handleDelete(scheduleId: string) {
    setDeleteLoading(scheduleId);
    try {
      const res = await fetch(`/api/schedules?id=${scheduleId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      }
    } catch {
      // Silently handle
    } finally {
      setDeleteLoading(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSiteId,
          frequency,
          hour,
          minute,
          timezone: "Europe/Amsterdam",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Refresh the schedules list
        await fetchData();
        // Reset form
        setFrequency("daily");
        setHour(9);
        setMinute(0);
      } else {
        setCreateError(data.error || "Er ging iets mis.");
      }
    } catch {
      setCreateError("Er ging iets mis bij het aanmaken van het schema.");
    } finally {
      setCreateLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schema&apos;s</h1>
          <p className="text-muted-foreground mt-1">
            Plan automatische publicaties voor je sites.
          </p>
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border bg-muted/50"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schema&apos;s</h1>
        <p className="text-muted-foreground mt-1">
          Plan automatische publicaties voor je sites.
        </p>
      </div>

      {/* Existing schedules */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Actieve schema&apos;s
        </h2>

        {schedules.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Nog geen schema&apos;s aangemaakt. Gebruik het formulier hieronder
              om te beginnen.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Site
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Frequentie
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Tijdstip
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Volgende run
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Actief
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Acties
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {schedules.map((schedule) => (
                    <tr
                      key={schedule.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 font-medium">
                        {schedule.asc_sites?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {formatFrequency(schedule.rrule)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {extractTimeFromRRule(schedule.rrule)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDateTime(schedule.next_run_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={schedule.is_enabled}
                          onCheckedChange={(checked) =>
                            handleToggle(schedule.id, checked)
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(schedule.id)}
                          disabled={deleteLoading === schedule.id}
                          className="text-sm text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          {deleteLoading === schedule.id
                            ? "Verwijderen..."
                            : "Verwijderen"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create new schedule */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Nieuw schema aanmaken
        </h2>

        {sites.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Voeg eerst een{" "}
              <a
                href="/sites/new"
                className="text-primary underline underline-offset-4"
              >
                site
              </a>{" "}
              toe voordat je een schema kunt aanmaken.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleCreate}
            className="rounded-xl border bg-card p-6 shadow-sm"
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Site selector */}
              <div className="space-y-2">
                <label
                  htmlFor="siteId"
                  className="text-sm font-medium leading-none"
                >
                  Site
                </label>
                <select
                  id="siteId"
                  value={selectedSiteId}
                  onChange={(e) => setSelectedSiteId(e.target.value)}
                  required
                  className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.5rem_center] pr-8 [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]"
                >
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Frequency */}
              <div className="space-y-2">
                <label
                  htmlFor="frequency"
                  className="text-sm font-medium leading-none"
                >
                  Frequentie
                </label>
                <select
                  id="frequency"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  required
                  className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.5rem_center] pr-8 [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hour */}
              <div className="space-y-2">
                <label
                  htmlFor="hour"
                  className="text-sm font-medium leading-none"
                >
                  Uur
                </label>
                <select
                  id="hour"
                  value={hour}
                  onChange={(e) => setHour(parseInt(e.target.value, 10))}
                  required
                  className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.5rem_center] pr-8 [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {h.toString().padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
              </div>

              {/* Minute */}
              <div className="space-y-2">
                <label
                  htmlFor="minute"
                  className="text-sm font-medium leading-none"
                >
                  Minuten
                </label>
                <select
                  id="minute"
                  value={minute}
                  onChange={(e) => setMinute(parseInt(e.target.value, 10))}
                  required
                  className="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] appearance-none bg-no-repeat bg-[length:1rem] bg-[position:right_0.5rem_center] pr-8 [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E')]"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      :{m.toString().padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Timezone note */}
            <p className="mt-4 text-xs text-muted-foreground">
              Tijdzone: Europe/Amsterdam (CET/CEST)
            </p>

            {/* Error */}
            {createError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                {createError}
              </div>
            )}

            {/* Submit */}
            <div className="mt-6">
              <button
                type="submit"
                disabled={!selectedSiteId || createLoading}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {createLoading ? "Aanmaken..." : "Schema aanmaken"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
