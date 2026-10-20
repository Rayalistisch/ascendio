import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TopicEditorClient } from "./editor-client";

export default async function TopicEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: topic } = await supabase
    .from("asc_cluster_topics")
    .select(
      "id, cluster_id, title, status, generated_title, generated_content, generated_meta"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!topic) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Concept niet gevonden.</p>
        <Button variant="outline" asChild>
          <Link href="/clusters">Terug naar clusters</Link>
        </Button>
      </div>
    );
  }

  if (!topic.generated_content) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">{topic.title}</h1>
        <p className="text-muted-foreground">
          Er is nog geen gegenereerde content voor dit onderwerp. Genereer het
          artikel eerst vanuit het cluster.
        </p>
        <Button variant="outline" asChild>
          <Link href="/clusters">Terug naar clusters</Link>
        </Button>
      </div>
    );
  }

  return (
    <TopicEditorClient
      topicId={topic.id}
      initialTitle={topic.generated_title || topic.title || ""}
      initialContent={topic.generated_content}
      status={topic.status}
    />
  );
}
