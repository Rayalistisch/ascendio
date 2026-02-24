import Image from "next/image";
import Link from "next/link";
import { Sora } from "next/font/google";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Database,
  Globe2,
  LayoutDashboard,
  LineChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  isActiveSubscriptionStatus,
  isDevBillingBypassEnabled,
} from "@/lib/billing";
import { LandingPricing } from "@/components/landing-pricing";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const techStack = [
  "WordPress",
  "OpenAI",
  "Google Search Console",
  "Supabase",
  "Stripe",
];


const steps: {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    number: "01",
    title: "Vertel wat je wilt bereiken",
    description:
      "Verbind je website, kies je schrijfstijl en bepaal waar je op gevonden wilt worden. Ascendio maakt een plan voor je.",
    icon: LayoutDashboard,
  },
  {
    number: "02",
    title: "Ascendio schrijft en controleert",
    description:
      "Je artikelen worden automatisch geschreven, onderling gelinkt en gecontroleerd op SEO.",
    icon: ShieldCheck,
  },
  {
    number: "03",
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
    <main className={`${sora.className} min-h-screen bg-[#f4f6fc] text-slate-900`}>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
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
              Hoe werkt het
            </Link>
            <Link href="#pricing" className="transition hover:text-slate-900">
              Pricing
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-slate-500 transition hover:text-slate-900 sm:inline-flex"
            >
              Inloggen
            </Link>
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Gratis starten
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pb-0 pt-20 text-center md:pt-28 md:px-10">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-4 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          7 dagen gratis · 10 credits · Geen creditcard nodig
        </div>

        {/* Heading */}
        <h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-[1.08] tracking-tight text-slate-900 sm:text-6xl md:text-[4.5rem]">
          Meer bezoekers op je website,{" "}
          <span className="text-indigo-600">zonder zelf te schrijven</span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-500">
          Ascendio bedenkt de juiste onderwerpen, schrijft je artikelen en plaatst
          ze direct op je website. Jij hoeft alleen op &quot;start&quot; te klikken.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800"
          >
            Gratis proberen
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="#workflow"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-3.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            Hoe werkt het?
          </Link>
        </div>

        {/* Use case pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
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

        {/* Hero screenshot with floating cards */}
        <div className="relative mx-auto mt-14 max-w-5xl">
          {/* Floating card: top left */}
          <div className="absolute -left-4 top-8 z-10 hidden rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-lg md:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Artikelen deze week</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">12</p>
            <p className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3 w-3" /> +4 t.o.v. vorige week
            </p>
          </div>

          {/* Floating card: top right */}
          <div className="absolute -right-4 top-12 z-10 hidden items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-lg md:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50">
              <Check className="h-4 w-4 text-emerald-600" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-900">Gepubliceerd</p>
              <p className="text-[10px] text-slate-400">Top 10 SEO-tips voor 2025</p>
            </div>
          </div>

          {/* Floating card: bottom left */}
          <div className="absolute -bottom-4 left-8 z-10 hidden items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-lg md:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50">
              <Sparkles className="h-4 w-4 text-indigo-500" />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-900">SEO Score</p>
              <p className="text-[10px] text-slate-400">94 / 100 · Uitstekend</p>
            </div>
          </div>

          {/* Main screenshot */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/80">
            <Image
              src="/landing/seo-score.png"
              alt="Ascendio dashboard"
              width={1200}
              height={720}
              className="w-full object-cover"
              priority
            />
          </div>
        </div>
      </section>

      {/* Tech strip */}
      <section className="border-y border-slate-200/60 bg-white py-5 mt-16">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 md:px-10">
          <span className="mr-2 text-slate-300">Werkt met</span>
          {techStack.map((item, i) => (
            <span key={item} className="flex items-center gap-4">
              {i > 0 && <span className="text-slate-200">·</span>}
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Features bento */}
      <section id="product" className="mx-auto max-w-7xl px-6 py-20 md:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Product</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            Alles wat je nodig hebt op één plek
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-500">
            Van onderwerp bedenken tot publiceren — Ascendio regelt het hele proces.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 md:grid-rows-2">

          {/* Stap 1 — spans both rows on the left */}
          <article
            className="flex flex-col justify-center overflow-hidden rounded-3xl border border-[#d9d9fb] bg-[#f0f0fd] p-7 md:row-span-2"
            style={{
              backgroundImage: "radial-gradient(rgba(99,102,241,0.15) 1.5px, transparent 1.5px)",
              backgroundSize: "22px 22px",
            }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Stap 1</p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">
                Slim onderzoek, zonder uren zoeken
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Ascendio vindt automatisch de beste onderwerpen op basis van zoektrends
                en je eigen Google-data. Elke dag nieuwe kansen, direct klaar om te gebruiken.
              </p>
              <Link
                href="/login?mode=signup"
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Gratis starten
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="pt-6 overflow-hidden rounded-2xl border border-white/60 shadow-sm">
              <Image
                src="/landing/bronnen.png"
                alt="Onderwerpen ontdekken"
                width={600}
                height={420}
                className="w-full object-cover"
              />
            </div>
          </article>

          {/* Stap 2 */}
          <article
            className="flex flex-col overflow-hidden rounded-3xl border border-[#d4e4fb] bg-[#f0f5fd] p-7"
            style={{
              backgroundImage: "radial-gradient(rgba(59,130,246,0.14) 1.5px, transparent 1.5px)",
              backgroundSize: "22px 22px",
            }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Stap 2</p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">
                Artikelen schrijven op autopilot
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Volledige SEO-artikelen klaar in één klik — in jouw stijl, met interne
                links en de juiste structuur voor Google.
              </p>
            </div>
            <div className="mt-auto pt-5 overflow-hidden rounded-2xl border border-white/60 shadow-sm">
              <Image
                src="/landing/artikelstructuur.png"
                alt="Artikelen schrijven"
                width={600}
                height={220}
                className="w-full object-cover"
              />
            </div>
          </article>

          {/* Stap 3 */}
          <article
            className="flex flex-col overflow-hidden rounded-3xl border border-[#fde4df] bg-[#fff4f2] p-7"
            style={{
              backgroundImage: "radial-gradient(rgba(244,114,98,0.15) 1.5px, transparent 1.5px)",
              backgroundSize: "22px 22px",
            }}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-400">Stap 3</p>
              <h3 className="mt-3 text-2xl font-bold text-slate-900">
                Direct live op je website
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Je content wordt automatisch geplaatst op je WordPress-site.
                Geen kopiëren, geen handmatig publiceren.
              </p>
            </div>
            <div className="mt-auto pt-5 overflow-hidden rounded-2xl border border-white/60 shadow-sm">
              <Image
                src="/landing/runs.png"
                alt="Publiceren"
                width={600}
                height={220}
                className="w-full object-cover"
              />
            </div>
          </article>

        </div>
      </section>

      {/* Stats / social proof */}
      <section className="bg-[#f4f6fc] py-20">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 md:text-5xl">
              Zo groeit je website met Ascendio
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-500">
              Websites die Ascendio gebruiken publiceren consistent meer content,
              scoren hoger in Google en bereiken meer bezoekers — zonder extra personeel.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-y-10 md:grid-cols-4">
            {[
              { stat: "3×", label: "meer organisch verkeer binnen 6 maanden" },
              { stat: "68%", label: "tijdsbesparing op contentcreatie" },
              { stat: "94/100", label: "gemiddelde SEO score per artikel" },
              { stat: "2×", label: "meer gepubliceerde artikelen per maand" },
            ].map(({ stat, label }) => (
              <div key={stat} className="text-center">
                <p className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
                  {stat}
                </p>
                <p className="mx-auto mt-2 max-w-[160px] text-sm leading-snug text-slate-500">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="workflow" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Hoe het werkt</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Zo simpel is het
            </h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {steps.map(({ number, title, description, icon: Icon }) => (
              <article key={title} className="relative rounded-2xl border border-slate-100 bg-[#f4f6fc] p-7">
                <span className="text-5xl font-extrabold text-slate-100">{number}</span>
                <div className="mt-2 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
                  <Icon className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities / screenshots */}
      <section className="mx-auto max-w-7xl px-6 py-20 md:px-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">Overzicht</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Volledige controle over je content
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-500">
              Je ziet precies wat er gebeurt: welke artikelen er zijn, hoe ze presteren
              en wat er nog moet gebeuren.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Elk artikel wordt automatisch gecontroleerd op kwaliteit",
                "Je pagina's linken slim naar elkaar voor betere vindbaarheid",
                "Zie hoe je content presteert met Google-data",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-slate-600">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50">
                    <Check className="h-3 w-3 text-indigo-600" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login?mode=signup"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Gratis proberen
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid gap-4">
            {capabilityGrid.map((tile) => (
              <article
                key={tile.title}
                className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md sm:grid-cols-[0.85fr_1.15fr]"
              >
                <div className="relative h-36 bg-slate-50 sm:h-full">
                  <Image
                    src={tile.image}
                    alt={tile.title}
                    fill
                    className="object-contain p-2"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-base font-semibold text-slate-900">{tile.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{tile.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <LandingPricing headingClassName={sora.className} />

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-20 md:px-10">
        <div className="overflow-hidden rounded-3xl bg-slate-950 px-8 py-14 text-center md:px-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Aan de slag</p>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold text-white md:text-4xl">
            Klaar om meer bezoekers te krijgen?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-slate-400">
            Verbind je website, kies je onderwerpen en laat Ascendio de rest doen.
            Je eerste artikelen kunnen vandaag nog online staan.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-slate-900 shadow transition hover:bg-slate-100"
            >
              Start gratis
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Ik heb al een account
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">7 dagen gratis · 10 credits · Geen creditcard nodig</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400">
        <div className="mx-auto max-w-7xl px-6 pb-10 pt-16 md:px-10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
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

            <div>
              <h4 className="text-sm font-semibold text-white">Product</h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="#product" className="transition hover:text-white">Functies</Link></li>
                <li><Link href="#workflow" className="transition hover:text-white">Hoe werkt het</Link></li>
                <li><Link href="#pricing" className="transition hover:text-white">Pricing</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">Bedrijf</h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="#" className="transition hover:text-white">Over Ascendio</Link></li>
                <li><Link href="#" className="transition hover:text-white">Blog</Link></li>
                <li><Link href="#" className="transition hover:text-white">Changelog</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white">Contact</h4>
              <ul className="mt-4 space-y-3 text-sm">
                <li><Link href="mailto:support@ascendio.nl" className="transition hover:text-white">Support</Link></li>
                <li><Link href="mailto:info@ascendio.nl" className="transition hover:text-white">info@ascendio.nl</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-800 pt-8 text-xs sm:flex-row">
            <p>&copy; {new Date().getFullYear()} Ascendio. Alle rechten voorbehouden.</p>
            <div className="flex items-center gap-6">
              <Link href="#" className="transition hover:text-white">Privacybeleid</Link>
              <Link href="#" className="transition hover:text-white">Algemene voorwaarden</Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
