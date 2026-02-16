import Image from "next/image";

export default function ComingSoonPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Coming Soon Visual</h1>
          <p className="mt-2 text-sm text-slate-600">
            Vervang later de volgende bestanden in <code>public/landing</code> met je eigen beelden:
            <code> coming-soon-shot-1.svg</code>,
            <code> coming-soon-shot-2.svg</code>,
            <code> coming-soon-shot-3.svg</code>.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="relative aspect-[16/9] w-full">
            <Image
              src="/landing/coming-soon-template.svg"
              alt="Coming soon template"
              fill
              className="object-cover"
              priority
            />
          </div>
        </div>
      </div>
    </main>
  );
}
