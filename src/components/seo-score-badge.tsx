import { Badge } from "@/components/ui/badge";

export function SeoScoreBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <Badge variant="secondary">—</Badge>;

  if (score <= 40) return <Badge variant="destructive">{score} Slecht</Badge>;
  if (score <= 60) return <Badge className="bg-orange-500 text-white">{score} Matig</Badge>;
  if (score <= 80) return <Badge className="bg-yellow-500 text-white">{score} Goed</Badge>;
  return <Badge className="bg-green-600 text-white">{score} Uitstekend</Badge>;
}
