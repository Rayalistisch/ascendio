import Image from "next/image";
import Link from "next/link";
import { Manrope, Sora } from "next/font/google";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Database,
  Globe2,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  isActiveSubscriptionStatus,
  isDevBillingBypassEnabled,
} from "@/lib/billing";
import { LandingPricing } from "@/components/landing-pricing";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const techStack = [
  "WordPress",
  "OpenAI",
  "Supabase",
  "Google Search Console",
  "Upstash QStash",
  "Stripe",
];

const systemCards: {
  title: string;
  description: string;
  stat: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Research Intelligence",
    description:
      "Detecteert kansen uit SERP trends, Search Console en actuele bronnen per workspace.",
    stat: "42 kansen / dag",
    icon: Sparkles,
  },
  {
    title: "Content Production",
    description:
      "Schrijft complete pagina's met interne links, structuur en metadata afgestemd op je clusterplan.",
    stat: "1-click run",
    icon: Bot,
  },
  {
    title: "Distribution Ops",
    description:
      "Publiceert naar WordPress en zet indexing, updates en rapportages direct klaar voor je team.",
    stat: "Live in minuten",
    icon: Workflow,
  },
];

const workflowPhases: {
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    label: "Fase 01",
    title: "Strategie per workspace",
    description:
      "Koppel domein, tone of voice en SEO-doel. Ascendio bouwt een pilar + cluster routekaart.",
    icon: LayoutDashboard,
  },
  {
    label: "Fase 02",
    title: "Runs met kwaliteitscontrole",
    description:
      "Generatie, interne linking en SEO checks lopen in dezelfde pipeline zonder handmatige stappen.",
    icon: ShieldCheck,
  },
  {
    label: "Fase 03",
    title: "Publicatie en groeidata",
    description:
      "Output gaat naar WordPress, waarna prestaties automatisch terugkomen in je rapportages.",
    icon: LineChart,
  },
];

const capabilityGrid: {
  title: string;
  description: string;
  image: string;
}[] = [
  {
    title: "Research Map",
    description:
      "Visualiseer kansrijke onderwerpen en cluster-relaties voordat je publiceert.",
    image: "/landing/research-map.svg",
  },
  {
    title: "Generation Studio",
    description:
      "Zet strategie om naar consistente output met vaste structuur en schrijfstijl.",
    image: "/landing/generation-lab.svg",
  },
  {
    title: "Distribution Grid",
    description:
      "Stuur content door naar WordPress en houd controle op indexering en updates.",
    image: "/landing/distribution-grid.svg",
  },
];

const useCases: { title: string; icon: LucideIcon }[] = [
  { title: "Multi-site beheer", icon: Globe2 },
  { title: "Content teams", icon: BarChart3 },
  { title: "SEO bureaus", icon: Database },
];

const reveal = (delayMs: number) => ({
  animation: "rise 780ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
  animationDelay: `${delayMs}ms`,
  opacity: 0,
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
    <main className={`${manrope.className} min-h-screen bg-[#f8f9fc] text-slate-900`}>
      {/* Subtle grid background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.03)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:radial-gradient(circle_at_50%_14%,black,transparent_72%)]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-[#f8f9fc]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6 md:px-10">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white">
              <span className="text-sm font-semibold">A</span>
              <span className="absolute inset-0 rounded-xl ring-1 ring-white/20" />
            </span>
            <span className={`${sora.className} text-lg font-semibold tracking-tight`}>
              Ascendio
            </span>
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-500 lg:flex">
            <Link href="#product" className="transition hover:text-slate-900">
              Product
            </Link>
            <Link href="#workflow" className="transition hover:text-slate-900">
              Workflow
            </Link>
            <Link href="#pricing" className="transition hover:text-slate-900">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-semibold text-slate-500 transition hover:text-slate-900 sm:inline-flex"
            >
              Inloggen
            </Link>
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Start gratis
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pb-20 pt-10 md:pt-16">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 md:px-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div style={reveal(80)}>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              AI Content Operations
            </span>
            <h1
              className={`${sora.className} mt-6 max-w-2xl text-[2.75rem] font-semibold leading-[1.06] tracking-tight text-slate-950 sm:text-5xl md:text-[3.5rem]`}
            >
              Van losse content taken naar een strakke
              <span className="bg-gradient-to-r from-sky-600 via-indigo-600 to-violet-500 bg-clip-text text-transparent">
                {" "}
                growth engine
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-500 md:text-lg">
              Ascendio automatiseert research, schrijven, interne linking, publicatie en
              rapportage vanuit één command center voor jouw website of klantportfolio.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Plan een eerste run
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Bekijk workflow
                <Workflow className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {useCases.map(({ title, icon: Icon }) => (
                <span
                  key={title}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {title}
                </span>
              ))}
            </div>
          </div>

          <div className="relative" style={reveal(180)}>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xl md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Command Center
                  </p>
                  <h3 className={`${sora.className} mt-2 text-xl font-semibold text-slate-900`}>
                    SEO Cluster Run
                  </h3>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Actief
                </span>
              </div>

              <div className="mt-5 grid gap-2.5">
                {[
                  "Research topics verzameld",
                  "Pillar + clusters gegenereerd",
                  "WordPress publicatie gepland",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5"
                  >
                    <span className="text-sm font-medium text-slate-600">{item}</span>
                    <Check className="h-4 w-4 text-emerald-500" />
                  </div>
                ))}
              </div>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                <div className="relative h-44 md:h-52">
                  <Image
                    src="/landing/ops-canvas.svg"
                    alt="Ascendio command center overzicht"
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="border-y border-slate-200/60 bg-white/50 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-6 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 md:px-10">
          {techStack.map((item, i) => (
            <span key={item} className="flex items-center gap-3">
              {i > 0 && <span className="text-slate-200">·</span>}
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Product */}
      <section id="product" className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            Product
          </p>
          <h2 className={`${sora.className} mt-4 text-3xl font-semibold md:text-4xl`}>
            Eén platform voor de volledige content-operatie
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-500">
            De kern van Ascendio is een modulair systeem dat strategy, productie en
            distributie aan elkaar koppelt.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {systemCards.map(({ title, description, stat, icon: Icon }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className={`${sora.className} mt-4 text-lg font-semibold text-slate-900`}>
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.13em] text-sky-600">
                {stat}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-y border-slate-200/60 bg-white/60 py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                Workflow
              </p>
              <h2 className={`${sora.className} mt-4 text-3xl font-semibold md:text-4xl`}>
                Duidelijke flow van idee naar publicatie
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-slate-500">
              Elke fase heeft vaste controles, zodat je team weet wat er gebeurt en waarom
              een run wel of niet live gaat.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {workflowPhases.map(({ label, title, description, icon: Icon }) => (
              <article
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <span className="inline-flex items-center rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {label}
                </span>
                <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className={`${sora.className} mt-4 text-lg font-semibold text-slate-900`}>
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Modules
            </p>
            <h2 className={`${sora.className} mt-4 text-3xl font-semibold md:text-4xl`}>
              Visuals die je operatie uitlegbaar maken
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-500">
              In plaats van losse prompts zie je per cluster exact welke input, output en
              KPI erbij horen.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "Prompt chaining met vaste QA checkpoints",
                "Interne linking op basis van je eigen content",
                "Rapportage met Search Console data per workspace",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white">
                    <Check className="h-3 w-3" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-3">
            {capabilityGrid.map((tile) => (
              <article
                key={tile.title}
                className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-slate-300 sm:grid-cols-[0.9fr_1.1fr]"
              >
                <div className="relative h-40 bg-slate-50 sm:h-full">
                  <Image
                    src={tile.image}
                    alt={tile.title}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-5">
                  <h3 className={`${sora.className} text-lg font-semibold text-slate-900`}>
                    {tile.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {tile.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <LandingPricing headingClassName={sora.className} />

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 py-10 shadow-xl md:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className={`${sora.className} text-3xl font-semibold text-slate-900 md:text-4xl`}>
              Klaar om je contentmachine live te zetten?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-500">
              Verbind je site, start je eerste cluster-run en laat Ascendio het
              operationele werk overnemen.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Start gratis
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Ik heb al een account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 bg-white/50">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6 text-sm text-slate-400 md:flex-row md:items-center md:justify-between md:px-10">
          <p>
            &copy; {new Date().getFullYear()} Ascendio. AI content operations voor teams.
          </p>
          <div className="flex items-center gap-4">
            <Link href="#product" className="transition hover:text-slate-900">
              Product
            </Link>
            <Link href="#workflow" className="transition hover:text-slate-900">
              Workflow
            </Link>
            <Link href="#pricing" className="transition hover:text-slate-900">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
