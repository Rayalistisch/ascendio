"use client";

import { useEffect, useRef } from "react";

interface HtmlPreviewProps {
  html: string;
  editable?: boolean;
  onChange?: (nextHtml: string) => void;
}

export function HtmlPreview({ html, editable = false, onChange }: HtmlPreviewProps) {
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editable || !editableRef.current) return;
    if (editableRef.current.innerHTML !== html) {
      editableRef.current.innerHTML = html;
    }
  }, [editable, html]);

  if (editable) {
    return (
      <div
        ref={editableRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => {
          onChange?.(event.currentTarget.innerHTML);
        }}
        className="prose prose-zinc max-w-none rounded-lg border bg-white p-6 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:prose-invert dark:bg-zinc-900"
      />
    );
  }

  return (
    <div
      className="prose prose-zinc max-w-none rounded-lg border bg-white p-6 dark:prose-invert dark:bg-zinc-900"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
