import Link from "next/link";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Inter } from "next/font/google";
import { createClient } from "@/lib/supabase/server";
import {
  isActiveSubscriptionStatus,
  isDevBillingBypassEnabled,
  TIERS,
} from "@/lib/billing";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default async function Home() {
  const billingBypass = isDevBillingBypassEnabled();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    if (billingBypass) redirect("/dashboard");

    const { data: subscription } = await supabase
      .from("asc_subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (isActiveSubscriptionStatus(subscription?.status)) {
      redirect("/dashboard");
    }

    redirect("/billing");
  }

  return (
    <main className={`${inter.className} min-h-screen bg-white text-slate-900`}>
      {/* ── NAV ── */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-10">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
            Ascendio
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-500 md:flex">
            <Link href="#how-it-works" className="transition hover:text-slate-900">
              Hoe het werkt
            </Link>
            <Link href="#features" className="transition hover:text-slate-900">
              Features
            </Link>
            <Link href="#plans" className="transition hover:text-slate-900">
              Pricing
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              Inloggen
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Gratis starten
            </Link>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-blue-100/50 blur-[120px]" />

        <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-20 text-center md:pb-28 md:pt-28">
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-600">
            AI Content Operations for WordPress
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
            Van losse taken naar een{" "}
            <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
              georkestreerde contentmachine
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500">
            Ascendio brengt research, generatie, SEO, publicatie en distributie samen in
            één visuele workflow. Niet meer schakelen tussen tools — geen handmatige
            ketens.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/30"
            >
              Start gratis
            </Link>
            <Link
              href="#how-it-works"
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-8 py-3.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Bekijk hoe het werkt
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </Link>
          </div>
        </div>

        {/* Hero visual */}
        <div className="relative mx-auto max-w-5xl px-6 pb-20 md:px-10">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl shadow-slate-200/50">
            <div className="relative h-[300px] md:h-[420px]">
              <Image
                src="/landing/ops-canvas.svg"
                alt="Ascendio workflow canvas"
                fill
                className="object-cover"
                priority
              />
            </div>
            {/* Floating cards */}
            <div className="absolute left-4 top-4 rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-lg backdrop-blur-sm md:left-6 md:top-6 md:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">
                Daily intake
              </p>
              <p className="mt-1 text-xs font-medium text-slate-700">
                18 bronnen gesynct, 42 bruikbare onderwerpen
              </p>
            </div>
            <div className="absolute bottom-14 right-4 rounded-xl border border-slate-200 bg-white/95 p-3.5 shadow-lg backdrop-blur-sm md:bottom-16 md:right-6 md:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                Live run
              </p>
              <p className="mt-1 text-xs font-medium text-slate-700">
                1 artikel gepubliceerd, social + indexing in queue
              </p>
            </div>
            <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 md:right-6">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-emerald-700">
                Workflow actief
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="border-y border-slate-100 bg-slate-50/50 py-10">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <p className="mb-6 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">
            Gebouwd met bewezen technologie
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {[
              "WordPress API",
              "OpenAI",
              "Supabase",
              "Upstash QStash",
              "Google Indexing",
              "RSS Feeds",
              "YouTube",
            ].map((name) => (
              <span
                key={name}
                className="text-sm font-semibold text-slate-300 transition hover:text-slate-400"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section
        id="how-it-works"
        className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28"
      >
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-600">
            Hoe het werkt
          </span>
          <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
            Drie lagen, één machine
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-500">
            Elke laag werkt autonoom en voedt de volgende — van bron tot publicatie.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Research",
              desc: "Bronnen worden automatisch opgehaald, samengevat en klaargezet als input voor nieuwe content runs.",
              icon: (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              ),
            },
            {
              step: "02",
              title: "Production",
              desc: "Ascendio genereert artikelen met structuur, featured images, interne links en SEO-opbouw.",
              icon: (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                  />
                </svg>
              ),
            },
            {
              step: "03",
              title: "Distribution",
              desc: "Content wordt gepland, gepubliceerd op WordPress en direct verspreid via social en indexing.",
              icon: (
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              ),
            },
          ].map((item) => (
            <article
              key={item.step}
              className="group relative rounded-2xl border border-slate-200 bg-white p-7 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-100"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                {item.icon}
              </div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs font-bold text-blue-600">{item.step}</span>
                <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-slate-500">{item.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── FEATURES VISUAL ── */}
      <section
        id="features"
        className="bg-slate-50 py-20 md:py-28"
      >
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-600">
              Features
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
              De machine in actie
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                src: "/landing/research-map.svg",
                title: "Bronnenkaart",
                desc: "Inputstromen worden automatisch samengebracht en geprioriteerd op relevantie.",
              },
              {
                src: "/landing/generation-lab.svg",
                title: "Generation Lab",
                desc: "Content en SEO-opbouw worden in één geautomatiseerde run gebouwd.",
              },
              {
                src: "/landing/distribution-grid.svg",
                title: "Distributie Grid",
                desc: "Output gaat direct naar publicatie en promotie via alle kanalen.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-100"
              >
                <div className="relative h-48 w-full overflow-hidden bg-slate-100">
                  <Image
                    src={item.src}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {item.desc}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY ASCENDIO ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-600">
              Waarom Ascendio
            </span>
            <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
              Vervang losse tools door één operationeel systeem
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-500">
              Geen duct-tape workflows meer. Alles draait in dezelfde omgeving, met
              dezelfde data, in dezelfde pipeline.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                title: "Minder context-switching",
                desc: "Alles in dezelfde flow, van idee tot gepubliceerde post.",
                icon: (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                    />
                  </svg>
                ),
              },
              {
                title: "Snellere output",
                desc: "Meer publicaties zonder extra handwerk of coördinatie.",
                icon: (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.841m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
                    />
                  </svg>
                ),
              },
              {
                title: "Betere kwaliteit",
                desc: "Ingebouwde SEO checks en automatische verbeteringen.",
                icon: (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                    />
                  </svg>
                ),
              },
              {
                title: "Schaalbaar beheer",
                desc: "Meerdere sites en contentlijnen vanuit één plek.",
                icon: (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                    />
                  </svg>
                ),
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-100"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  {item.icon}
                </div>
                <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  {item.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="plans" className="bg-slate-50 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6 md:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-600">
              Pricing
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
              Schaal wanneer je workflow staat
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-500">
              Begin klein, groei mee. Upgrade of downgrade op elk moment.
            </p>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {TIERS.map((tier, i) => (
              <article
                key={tier.id}
                className={`relative flex flex-col rounded-2xl border p-7 transition-all duration-200 hover:-translate-y-1 ${
                  i === 1
                    ? "border-blue-600 bg-white shadow-xl shadow-blue-600/10"
                    : "border-slate-200 bg-white hover:shadow-lg hover:shadow-slate-100"
                }`}
              >
                {i === 1 && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-[11px] font-semibold text-white">
                    Meest gekozen
                  </span>
                )}
                <p className="text-sm font-bold uppercase tracking-wider text-blue-600">
                  {tier.name}
                </p>
                <p className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
                  {tier.priceLabel}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  {tier.description}
                </p>

                <ul className="mt-6 flex-1 space-y-3 border-t border-slate-100 pt-6">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-slate-600"
                    >
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/login?mode=signup"
                  className={`mt-7 block rounded-lg py-3 text-center text-sm font-semibold transition ${
                    i === 1
                      ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                      : "border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  Aan de slag
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 px-8 py-16 text-center md:px-16 md:py-20">
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-blue-500/30 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-20 -right-20 h-64 w-64 rounded-full bg-blue-400/20 blur-[80px]" />
          <h2 className="relative text-3xl font-bold leading-tight text-white md:text-4xl">
            Klaar om je contentmachine te starten?
          </h2>
          <p className="relative mx-auto mt-4 max-w-lg text-base leading-relaxed text-blue-100">
            Probeer Ascendio gratis en ervaar hoe geautomatiseerde content operations
            werken.
          </p>
          <div className="relative mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-white px-8 py-3.5 text-sm font-semibold text-blue-600 shadow-md transition hover:bg-blue-50"
            >
              Start gratis
            </Link>
            <Link
              href="#how-it-works"
              className="rounded-lg border border-white/30 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Meer informatie
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div>
              <p className="text-lg font-bold tracking-tight text-slate-900">Ascendio</p>
              <p className="mt-1 text-sm text-slate-400">
                AI content operations for WordPress
              </p>
            </div>
            <nav className="flex items-center gap-6 text-sm text-slate-400">
              <Link href="#how-it-works" className="transition hover:text-slate-600">
                Hoe het werkt
              </Link>
              <Link href="#features" className="transition hover:text-slate-600">
                Features
              </Link>
              <Link href="#plans" className="transition hover:text-slate-600">
                Pricing
              </Link>
              <Link href="/login" className="transition hover:text-slate-600">
                Inloggen
              </Link>
            </nav>
          </div>
          <div className="mt-8 border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
            &copy; {new Date().getFullYear()} Ascendio. Alle rechten voorbehouden.
          </div>
        </div>
      </footer>
    </main>
  );
}
