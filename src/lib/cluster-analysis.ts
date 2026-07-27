// Cluster-analyse: reverse-engineer de bestaande contentstructuur van een site
// naar topic-clusters, op basis van (1) de echte interne links tussen pagina's
// en (2) semantische gelijkenis via embeddings (link-graaf, Laag 3).
//
// Uitkomst: welke clusters er organisch al zijn, welke pagina de pillar lijkt
// (meeste inkomende interne links), hoe sterk de groep al onderling gelinkt is
// (cohesie), en welke pagina's los staan (orphans = kans).

export interface AnalysisPost {
  wpPostId: number;
  title: string;
  slug: string;
  url: string;
  content: string | null;
  embedding: number[] | null;
}

export interface ClusterMember {
  wpPostId: number;
  title: string;
  url: string;
  inLinks: number;
}

export interface DetectedCluster {
  pillar: ClusterMember;
  members: ClusterMember[];
  size: number;
  cohesionPct: number; // aandeel van mogelijke member↔member links dat al bestaat
  avgSimilarity: number | null;
}

export interface ClusterAnalysis {
  method: "semantic" | "links";
  totalPosts: number;
  postsWithEmbedding: number;
  totalInternalLinks: number;
  clusters: DetectedCluster[];
  orphans: ClusterMember[];
}

const SIM_THRESHOLD = 0.55; // cosine-drempel voor "hoort bij hetzelfde onderwerp"
const MAX_POSTS = 400; // begrens O(N²)-werk binnen een API-request

function lastPathSegment(u: string): string {
  try {
    const path = new URL(u).pathname.replace(/\/+$/, "");
    return path.split("/").filter(Boolean).pop() || "";
  } catch {
    return u.replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  }
}

function normalizeUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return (parsed.origin + parsed.pathname).replace(/\/+$/, "").toLowerCase();
  } catch {
    return u.replace(/\/+$/, "").toLowerCase();
  }
}

/** Extraheer href-doelen uit HTML. */
function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function analyzeClusters(input: AnalysisPost[]): ClusterAnalysis {
  const posts = input.slice(0, MAX_POSTS);
  const byId = new Map(posts.map((p) => [p.wpPostId, p]));

  // Lookups om link-doelen aan posts te koppelen.
  const byUrl = new Map<string, number>();
  const bySlug = new Map<string, number>();
  for (const p of posts) {
    if (p.url) byUrl.set(normalizeUrl(p.url), p.wpPostId);
    if (p.slug) bySlug.set(p.slug.toLowerCase(), p.wpPostId);
  }

  // Bouw de gerichte link-graaf.
  const outLinks = new Map<number, Set<number>>();
  const inDegree = new Map<number, number>();
  let totalInternalLinks = 0;
  for (const p of posts) {
    const targets = new Set<number>();
    for (const href of extractHrefs(p.content || "")) {
      let targetId: number | undefined;
      // absolute of relatieve URL → normaliseer en match op url of slug
      const abs = href.startsWith("http") ? href : `https://x/${href.replace(/^\//, "")}`;
      targetId = byUrl.get(normalizeUrl(href)) ?? bySlug.get(lastPathSegment(abs).toLowerCase());
      if (targetId && targetId !== p.wpPostId) targets.add(targetId);
    }
    outLinks.set(p.wpPostId, targets);
    totalInternalLinks += targets.size;
    for (const t of targets) inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
  }

  const inLinksOf = (id: number) => inDegree.get(id) ?? 0;
  const toMember = (id: number): ClusterMember => {
    const p = byId.get(id)!;
    return { wpPostId: id, title: p.title, url: p.url, inLinks: inLinksOf(id) };
  };

  const withEmbedding = posts.filter((p) => Array.isArray(p.embedding) && p.embedding.length > 0);
  const useSemantic = withEmbedding.length >= Math.max(4, posts.length * 0.5);

  const clusters: DetectedCluster[] = [];
  const assigned = new Set<number>();

  if (useSemantic) {
    // Greedy: begin bij de sterkste hubs, groepeer semantisch verwante posts.
    const seeds = [...withEmbedding].sort((a, b) => inLinksOf(b.wpPostId) - inLinksOf(a.wpPostId));
    for (const seed of seeds) {
      if (assigned.has(seed.wpPostId)) continue;
      const groupIds: number[] = [seed.wpPostId];
      const sims: number[] = [];
      for (const other of withEmbedding) {
        if (other.wpPostId === seed.wpPostId || assigned.has(other.wpPostId)) continue;
        const sim = cosine(seed.embedding!, other.embedding!);
        if (sim >= SIM_THRESHOLD) {
          groupIds.push(other.wpPostId);
          sims.push(sim);
        }
      }
      if (groupIds.length < 2) continue; // geen cluster
      groupIds.forEach((id) => assigned.add(id));
      clusters.push(buildCluster(groupIds, toMember, outLinks, sims));
    }
  } else {
    // Fallback: connected components van de (ongerichte) link-graaf.
    const adj = new Map<number, Set<number>>();
    for (const [from, tos] of outLinks) {
      for (const to of tos) {
        if (!adj.has(from)) adj.set(from, new Set());
        if (!adj.has(to)) adj.set(to, new Set());
        adj.get(from)!.add(to);
        adj.get(to)!.add(from);
      }
    }
    for (const p of posts) {
      if (assigned.has(p.wpPostId) || !adj.has(p.wpPostId)) continue;
      const stack = [p.wpPostId];
      const comp: number[] = [];
      while (stack.length) {
        const id = stack.pop()!;
        if (assigned.has(id)) continue;
        assigned.add(id);
        comp.push(id);
        for (const n of adj.get(id) ?? []) if (!assigned.has(n)) stack.push(n);
      }
      if (comp.length >= 2) clusters.push(buildCluster(comp, toMember, outLinks, []));
    }
  }

  clusters.sort((a, b) => b.size - a.size);

  // Orphans: geen inkomende én geen uitgaande interne links.
  const orphans = posts
    .filter((p) => inLinksOf(p.wpPostId) === 0 && (outLinks.get(p.wpPostId)?.size ?? 0) === 0)
    .map((p) => toMember(p.wpPostId));

  return {
    method: useSemantic ? "semantic" : "links",
    totalPosts: posts.length,
    postsWithEmbedding: withEmbedding.length,
    totalInternalLinks,
    clusters,
    orphans,
  };
}

function buildCluster(
  ids: number[],
  toMember: (id: number) => ClusterMember,
  outLinks: Map<number, Set<number>>,
  sims: number[]
): DetectedCluster {
  const members = ids.map(toMember).sort((a, b) => b.inLinks - a.inLinks);
  const pillar = members[0];

  // Cohesie: hoeveel member→member links bestaan er van het maximum.
  const idSet = new Set(ids);
  let internal = 0;
  for (const id of ids) {
    for (const t of outLinks.get(id) ?? []) if (idSet.has(t)) internal++;
  }
  const possible = ids.length * (ids.length - 1);
  const cohesionPct = possible > 0 ? Math.round((internal / possible) * 100) : 0;
  const avgSimilarity =
    sims.length > 0 ? Math.round((sims.reduce((s, v) => s + v, 0) / sims.length) * 100) / 100 : null;

  return { pillar, members, size: members.length, cohesionPct, avgSimilarity };
}
