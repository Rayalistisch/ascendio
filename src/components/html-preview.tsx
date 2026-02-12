"use client";

export function HtmlPreview({ html }: { html: string }) {
  return (
    <div
      className="prose prose-zinc max-w-none rounded-lg border bg-white p-6 dark:prose-invert dark:bg-zinc-900"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
