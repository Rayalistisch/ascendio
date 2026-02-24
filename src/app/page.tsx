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
    title: "Slim onderzoek",
    description:
      "Ascendio vindt automatisch de beste onderwerpen voor jouw website op basis van zoektrends en je eigen data.",
    stat: "Dagelijks nieuwe kansen",
    icon: Sparkles,
  },
  {
    title: "Artikelen schrijven",
    description:
      "Volledige artikelen worden voor je geschreven, inclusief links naar je eigen pagina's en goede SEO-structuur.",
    stat: "In één klik klaar",
    icon: Bot,
  },
  {
    title: "Direct publiceren",
    description:
      "Je content wordt automatisch op je WordPress-site geplaatst. Geen handmatig kopiëren meer.",
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
    label: "Stap 1",
    title: "Vertel wat je wilt bereiken",
    description:
      "Verbind je website, kies je schrijfstijl en bepaal waar je op gevonden wilt worden. Ascendio maakt een plan voor je.",
    icon: LayoutDashboard,
  },
  {
    label: "Stap 2",
    title: "Ascendio schrijft en controleert",
    description:
      "Je artikelen worden automatisch geschreven, onderling gelinkt en gecontroleerd op SEO. Zonder dat jij iets hoeft te doen.",
    icon: ShieldCheck,
  },
  {
    label: "Stap 3",
    title: "Publiceren en resultaten zien",
    description:
      "Je content verschijnt op je website en je ziet meteen hoe je artikelen presteren in Google.",
    icon: LineChart,
  },
];

const capabilityGrid: {
  title: string;
  description: string;
  image: string;
}[] = [
  {
    title: "Onderwerpen ontdekken",
    description:
      "Zie in één overzicht welke onderwerpen kansrijk zijn en hoe ze met elkaar samenhangen.",
    image: "/landing/bronnen.png",
  },
  {
    title: "Content op maat",
    description:
      "Elk artikel wordt geschreven in jouw stijl, met een vaste structuur die werkt voor Google.",
    image: "/landing/artikelstructuur.png",
  },
  {
    title: "Alles op je site",
    description:
      "Je artikelen worden automatisch op je WordPress-site geplaatst. Jij houdt de controle.",
    image: "/landing/runs.png",
  },
];

const useCases: { title: string; icon: LucideIcon }[] = [
  { title: "Meerdere websites", icon: Globe2 },
  { title: "Marketing teams", icon: BarChart3 },
  { title: "SEO-bureaus", icon: Database },
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
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.svg"
              alt="Ascendio"
              width={220}
              height={220}
              className="h-44 w-auto"
            />
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
            <h1
              className={`${sora.className} mt-6 max-w-2xl text-[2.75rem] font-semibold leading-[1.06] tracking-tight text-slate-950 sm:text-5xl md:text-[3.5rem]`}
            >
              Verhoog je SEO score,
              <span className="bg-gradient-to-r from-sky-600 via-indigo-600 to-violet-500 bg-clip-text text-transparent">
                {" "}
                zonder zelf te schrijven
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-500 md:text-lg">
              Ascendio bedenkt de juiste onderwerpen, schrijft je artikelen en plaatst ze
              direct op je website. Jij hoeft alleen nog op &quot;start&quot; te klikken.
            </p>
            <p className="mt-2 text-sm text-slate-400">
              7 dagen gratis · 10 credits · Geen creditcard nodig
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                Gratis proberen
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              >
                Hoe werkt het?
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
                    Dashboard
                  </p>
                  <h3 className={`${sora.className} mt-2 text-xl font-semibold text-slate-900`}>
                    Content wordt gemaakt
                  </h3>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Actief
                </span>
              </div>

              <div className="mt-5 grid gap-2.5">
                {[
                  "Onderwerpen onderzocht",
                  "Artikelen geschreven",
                  "Klaar om te publiceren",
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
                    src="/landing/seo-score.png"
                    alt="Ascendio SEO score overzicht"
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
          <h2 className={`${sora.className} mt-4 text-3xl font-semibold md:text-4xl`}>
            Alles wat je nodig hebt op één plek
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-500">
            Van onderwerp bedenken tot publiceren van artikelen, Ascendio regelt het hele proces
            zodat jij je kunt focussen op je bedrijf.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {systemCards.map(({ title, description, stat, icon: Icon }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-300 text-white">
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
              <h2 className={`${sora.className} mt-4 text-3xl font-semibold md:text-4xl`}>
                Zo simpel werkt het
              </h2>
            </div>
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
                <div className="mt-4 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-300 text-white">
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
            <h2 className={`${sora.className} mt-4 text-3xl font-semibold md:text-4xl`}>
              Overzicht en controle over je content
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-500">
              Je ziet precies wat er gebeurt: welke artikelen er zijn, hoe ze presteren en
              wat er nog moet gebeuren.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "Elk artikel wordt automatisch gecontroleerd op kwaliteit",
                "Je pagina's linken slim naar elkaar voor betere vindbaarheid",
                "Zie hoe je content presteert met Google-data",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-300 text-white">
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
                    className="object-contain p-2"
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
              Klaar om meer bezoekers te krijgen?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-500">
              Verbind je website, kies je onderwerpen en laat Ascendio de rest doen.
              Je eerste artikelen kunnen vandaag nog online staan.
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
      <footer className="bg-slate-950 text-slate-400">
        <div className="mx-auto max-w-7xl px-6 pb-10 pt-16 md:px-10">
          {/* Top section: logo + link columns */}
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            {/* Brand column */}
            <div>
              <Link href="/" className="inline-block">
                <Image
                  src="/logo.svg"
                  alt="Ascendio"
                  width={160}
                  height={160}
                  className="h-28 w-auto brightness-0 invert"
                />
              </Link>
              <p className="mt-3 max-w-xs text-sm leading-relaxed">
                Slimme content voor groeiende websites. Ascendio automatiseert je
                contentproductie zodat jij je kunt focussen op je bedrijf.
              </p>
            </div>

            {/* Product column */}
            <div>
              <h4 className={`${sora.className} text-sm font-semibold text-white`}>
                Product
              </h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <Link href="#product" className="transition hover:text-white">
                    Functies
                  </Link>
                </li>
                <li>
                  <Link href="#workflow" className="transition hover:text-white">
                    Zo werkt het
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="transition hover:text-white">
                    Pricing
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company column */}
            <div>
              <h4 className={`${sora.className} text-sm font-semibold text-white`}>
                Bedrijf
              </h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <Link href="#" className="transition hover:text-white">
                    Over Ascendio
                  </Link>
                </li>
                <li>
                  <Link href="#" className="transition hover:text-white">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="transition hover:text-white">
                    Changelog
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contact column */}
            <div>
              <h4 className={`${sora.className} text-sm font-semibold text-white`}>
                Contact
              </h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li>
                  <Link href="mailto:support@ascend.io" className="transition hover:text-white">
                    Support
                  </Link>
                </li>
                <li>
                  <Link href="mailto:info@ascend.io" className="transition hover:text-white">
                    info@ascend.io
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-xs sm:flex-row">
            <p>&copy; {new Date().getFullYear()} Ascendio. Alle rechten voorbehouden.</p>
            <div className="flex items-center gap-6">
              <Link href="#" className="transition hover:text-white">
                Privacybeleid
              </Link>
              <Link href="#" className="transition hover:text-white">
                Algemene voorwaarden
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
