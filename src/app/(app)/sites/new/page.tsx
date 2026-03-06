"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const INPUT_CLASS = "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export default function NewSitePage() {
  const router = useRouter();

  const [platform, setPlatform] = useState<"wordpress" | "ibvision">("wordpress");
  const [name, setName] = useState("");

  // WordPress fields
  const [wpBaseUrl, setWpBaseUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");

  // IBVision fields
  const [ibvisionBaseUrl, setIbvisionBaseUrl] = useState("");
  const [ibvisionApiKey, setIbvisionApiKey] = useState("");
  const [ibvisionUrlPrefix, setIbvisionUrlPrefix] = useState("/");

  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canTest = platform === "wordpress"
    ? !!(wpBaseUrl && wpUsername && wpAppPassword)
    : !!(ibvisionBaseUrl && ibvisionApiKey);

  const canSave = platform === "wordpress"
    ? !!(name && wpBaseUrl && wpUsername && wpAppPassword)
    : !!(name && ibvisionBaseUrl && ibvisionApiKey);

  async function handleTestConnection() {
    setTestLoading(true);
    setTestResult(null);

    try {
      if (platform === "ibvision") {
        // Simple reachability check for IBVision
        const res = await fetch("/api/sites/test-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: "ibvision", ibvisionBaseUrl, ibvisionApiKey }),
        });
        const data = await res.json();
        setTestResult({
          success: data.success,
          message: data.success ? "IBVision verbinding geslaagd" : (data.error || "Verbinding mislukt. Controleer URL en API key."),
        });
      } else {
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
          });
        } else {
          setTestResult({
            success: false,
            message: data.error || "Verbinding mislukt. Controleer je gegevens.",
          });
        }
      }
    } catch {
      setTestResult({ success: false, message: "Er ging iets mis bij het testen van de verbinding." });
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
        body: JSON.stringify(
          platform === "ibvision"
            ? { name, platform, ibvisionBaseUrl, ibvisionApiKey, ibvisionUrlPrefix }
            : { name, platform, wpBaseUrl, wpUsername, wpAppPassword }
        ),
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
          Koppel een site om automatisch artikelen te publiceren.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="max-w-lg space-y-6">
        {/* Platform selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium leading-none">Platform</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setPlatform("wordpress"); setTestResult(null); }}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                platform === "wordpress"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-accent"
              }`}
            >
              WordPress
            </button>
            <button
              type="button"
              onClick={() => { setPlatform("ibvision"); setTestResult(null); }}
              className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                platform === "ibvision"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-background hover:bg-accent"
              }`}
            >
              IBVision CMS
            </button>
          </div>
        </div>

        {/* Sitenaam */}
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium leading-none">
            Sitenaam
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mijn Site"
            required
            className={INPUT_CLASS}
          />
        </div>

        {/* WordPress velden */}
        {platform === "wordpress" && (
          <>
            <div className="space-y-2">
              <label htmlFor="wpBaseUrl" className="text-sm font-medium leading-none">
                WordPress URL
              </label>
              <input
                id="wpBaseUrl"
                type="url"
                value={wpBaseUrl}
                onChange={(e) => setWpBaseUrl(e.target.value)}
                placeholder="https://jouwsite.nl"
                required
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wpUsername" className="text-sm font-medium leading-none">
                WordPress gebruikersnaam
              </label>
              <input
                id="wpUsername"
                type="text"
                value={wpUsername}
                onChange={(e) => setWpUsername(e.target.value)}
                placeholder="admin"
                required
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="wpAppPassword" className="text-sm font-medium leading-none">
                Applicatiewachtwoord
              </label>
              <input
                id="wpAppPassword"
                type="password"
                value={wpAppPassword}
                onChange={(e) => setWpAppPassword(e.target.value)}
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                required
                className={INPUT_CLASS}
              />
              <p className="text-xs text-muted-foreground">
                Maak een applicatiewachtwoord aan in WordPress via Gebruikers &rarr;
                Profiel &rarr; Applicatiewachtwoorden.
              </p>
            </div>
          </>
        )}

        {/* IBVision velden */}
        {platform === "ibvision" && (
          <>
            <div className="space-y-2">
              <label htmlFor="ibvisionBaseUrl" className="text-sm font-medium leading-none">
                IBVision basis-URL
              </label>
              <input
                id="ibvisionBaseUrl"
                type="url"
                value={ibvisionBaseUrl}
                onChange={(e) => setIbvisionBaseUrl(e.target.value)}
                placeholder="https://jouwsite.ibvision.nl"
                required
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="ibvisionApiKey" className="text-sm font-medium leading-none">
                API Key
              </label>
              <input
                id="ibvisionApiKey"
                type="password"
                value={ibvisionApiKey}
                onChange={(e) => setIbvisionApiKey(e.target.value)}
                placeholder="nRiY4jPP..."
                required
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="ibvisionUrlPrefix" className="text-sm font-medium leading-none">
                URL prefix <span className="text-muted-foreground font-normal">(optioneel)</span>
              </label>
              <input
                id="ibvisionUrlPrefix"
                type="text"
                value={ibvisionUrlPrefix}
                onChange={(e) => setIbvisionUrlPrefix(e.target.value)}
                placeholder="/seo/"
                className={INPUT_CLASS}
              />
              <p className="text-xs text-muted-foreground">
                Gegenereerde pagina&apos;s krijgen dit pad als prefix, bijv. <code>/seo/artikel-titel</code>.
              </p>
            </div>
          </>
        )}

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
