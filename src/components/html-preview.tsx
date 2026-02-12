"use client";

export function HtmlPreview({ html }: { html: string }) {
  return (
    <div
      className="prose prose-sm max-w-none rounded-lg border bg-white p-6 dark:bg-zinc-900"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
