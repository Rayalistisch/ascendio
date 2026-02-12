"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewSitePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [wpBaseUrl, setWpBaseUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");

  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    displayName?: string;
  } | null>(null);

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canTest = wpBaseUrl && wpUsername && wpAppPassword;
  const canSave = name && wpBaseUrl && wpUsername && wpAppPassword;

  async function handleTestConnection() {
    setTestLoading(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/sites/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wpBaseUrl, wpUsername, wpAppPassword }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Verbinding geslaagd${data.displayName ? ` — ingelogd als ${data.displayName}` : ""}`,
          displayName: data.displayName,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Verbinding mislukt. Controleer je gegevens.",
        });
      }
    } catch {
      setTestResult({
        success: false,
        message: "Er ging iets mis bij het testen van de verbinding.",
      });
    } finally {
      setTestLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, wpBaseUrl, wpUsername, wpAppPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push("/sites");
      } else {
        setSaveError(data.error || "Er ging iets mis bij het opslaan.");
      }
    } catch {
      setSaveError("Er ging iets mis bij het opslaan.");
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/sites"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Terug naar sites
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Nieuwe site toevoegen
        </h1>
        <p className="text-muted-foreground mt-1">
          Koppel een WordPress-site om automatisch artikelen te publiceren.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="max-w-lg space-y-6">
        {/* Sitenaam */}
        <div className="space-y-2">
          <label
            htmlFor="name"
            className="text-sm font-medium leading-none"
          >
            Sitenaam
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mijn Blog"
            required
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>

        {/* WordPress URL */}
        <div className="space-y-2">
          <label
            htmlFor="wpBaseUrl"
            className="text-sm font-medium leading-none"
          >
            WordPress URL
          </label>
          <input
            id="wpBaseUrl"
            type="url"
            value={wpBaseUrl}
            onChange={(e) => setWpBaseUrl(e.target.value)}
            placeholder="https://jouwsite.nl"
            required
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>

        {/* WordPress gebruikersnaam */}
        <div className="space-y-2">
          <label
            htmlFor="wpUsername"
            className="text-sm font-medium leading-none"
          >
            WordPress gebruikersnaam
          </label>
          <input
            id="wpUsername"
            type="text"
            value={wpUsername}
            onChange={(e) => setWpUsername(e.target.value)}
            placeholder="admin"
            required
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
        </div>

        {/* Applicatiewachtwoord */}
        <div className="space-y-2">
          <label
            htmlFor="wpAppPassword"
            className="text-sm font-medium leading-none"
          >
            Applicatiewachtwoord
          </label>
          <input
            id="wpAppPassword"
            type="password"
            value={wpAppPassword}
            onChange={(e) => setWpAppPassword(e.target.value)}
            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
            required
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <p className="text-xs text-muted-foreground">
            Maak een applicatiewachtwoord aan in WordPress via Gebruikers &rarr;
            Profiel &rarr; Applicatiewachtwoorden. Dit is niet je gewone
            WordPress-wachtwoord.
          </p>
        </div>

        {/* Test connection */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={!canTest || testLoading}
            className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          >
            {testLoading ? "Testen..." : "Verbinding testen"}
          </button>

          {testResult && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                testResult.success
                  ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
              }`}
            >
              {testResult.message}
            </div>
          )}
        </div>

        {/* Save error */}
        {saveError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {saveError}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={!canSave || saveLoading}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {saveLoading ? "Opslaan..." : "Site opslaan"}
          </button>
          <Link
            href="/sites"
            className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Annuleren
          </Link>
        </div>
      </form>
    </div>
  );
}
