"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const requestedInterval = searchParams.get("interval") === "yearly" ? "yearly" : "monthly";
  const recoveryType = searchParams.get("type") === "recovery";
  const loggedOut = searchParams.get("logged_out") === "1";
  const billingBypass = process.env.NEXT_PUBLIC_DEV_BILLING_BYPASS === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [isResetMode, setIsResetMode] = useState(mode === "reset" || recoveryType);
  const [loading, setLoading] = useState(false);
  const [sendingResetMail, setSendingResetMail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsResetMode(true);
        setIsSignUp(false);
        setMessage("Stel hieronder je nieuwe wachtwoord in.");
        setError(null);
      }
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  async function requestPasswordReset() {
    if (!email.trim()) {
      setError("Vul eerst je e-mailadres in.");
      return;
    }

    setSendingResetMail(true);
    setError(null);
    setMessage(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login?mode=reset`,
      });
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setMessage("Reset-link verzonden. Check je inbox.");
    } finally {
      setSendingResetMail(false);
    }
  }

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const nextPath = billingBypass
      ? "/dashboard"
      : `/dashboard`;

    if (isResetMode) {
      if (newPassword.length < 6) {
        setError("Nieuw wachtwoord moet minimaal 6 tekens bevatten.");
        setLoading(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Wachtwoorden komen niet overeen.");
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError("Reset-link is verlopen of ongeldig. Vraag opnieuw een reset aan.");
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      await supabase.auth.signOut();
      setIsResetMode(false);
      setIsSignUp(false);
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Wachtwoord succesvol aangepast. Log opnieuw in.");
      setLoading(false);
      return;
    }

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(
            nextPath
          )}`,
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Controleer je e-mail om je account te activeren. Je krijgt 7 dagen gratis met 10 credits — geen creditcard nodig.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        window.location.href = nextPath;
      }
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 px-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Ascendio</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isResetMode
              ? "Kies een nieuw wachtwoord voor je account."
              : isSignUp
              ? "Maak een account aan en start je gratis trial van 7 dagen."
              : "Welkom terug. Log in om verder te gaan."}
          </p>
          {loggedOut && (
            <p className="mt-2 text-sm text-green-600">Je bent uitgelogd.</p>
          )}
        </div>

        {!isResetMode && (
          <div className="mt-6">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Doorgaan met Google
            </button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-input" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">of</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-0 space-y-4">
          {!isResetMode ? (
            <>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground"
                >
                  E-mailadres
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="jouw@email.nl"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-foreground"
                >
                  Wachtwoord
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="••••••••"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label
                  htmlFor="new-password"
                  className="block text-sm font-medium text-foreground"
                >
                  Nieuw wachtwoord
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-sm font-medium text-foreground"
                >
                  Herhaal nieuw wachtwoord
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="••••••••"
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "Even geduld..."
              : isResetMode
                ? "Nieuw wachtwoord opslaan"
                : isSignUp
                ? "Account aanmaken"
                : "Inloggen"}
          </button>

          {!isSignUp && !isResetMode && (
            <button
              type="button"
              onClick={requestPasswordReset}
              disabled={sendingResetMail}
              className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted disabled:opacity-50"
            >
              {sendingResetMail ? "Reset-link versturen..." : "Wachtwoord vergeten?"}
            </button>
          )}
        </form>

        {isResetMode ? (
          <p className="text-center text-sm text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setIsResetMode(false);
                setIsSignUp(false);
                setError(null);
                setMessage(null);
              }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Terug naar inloggen
            </button>
          </p>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "Heb je al een account?" : "Nog geen account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setIsResetMode(false);
                setError(null);
                setMessage(null);
              }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {isSignUp ? "Inloggen" : "Registreren"}
            </button>
          </p>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            Terug naar landingspagina
          </Link>
          {" · "}
          <Link href="/api/auth/signout" className="underline-offset-4 hover:underline">
            Forceer uitloggen
          </Link>
        </p>
      </div>
    </div>
  );
}
