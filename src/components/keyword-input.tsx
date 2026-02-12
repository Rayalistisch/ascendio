"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function KeywordInput({ keywords, onChange }: { keywords: string[]; onChange: (kw: string[]) => void }) {
  const [value, setValue] = useState("");

  const addKeyword = () => {
    const kw = value.trim();
    if (kw && !keywords.includes(kw)) {
      onChange([...keywords, kw]);
      setValue("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {keywords.map((kw) => (
          <Badge key={kw} variant="secondary" className="cursor-pointer" onClick={() => onChange(keywords.filter((k) => k !== kw))}>
            {kw} ×
          </Badge>
        ))}
      </div>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
        placeholder="Zoekwoord toevoegen..."
        className="text-sm"
      />
    </div>
  );
}
