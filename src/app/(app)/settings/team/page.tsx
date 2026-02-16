"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Site {
  id: string;
  name: string;
}

interface SiteMember {
  id: string;
  site_id: string;
  member_email: string;
  role: "admin" | "editor" | "viewer";
  status: "invited" | "active" | "disabled";
  invited_at: string;
  created_at: string;
}

const ROLE_OPTIONS: Array<{ value: SiteMember["role"]; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

const STATUS_OPTIONS: Array<{ value: SiteMember["status"]; label: string }> = [
  { value: "invited", label: "Uitgenodigd" },
  { value: "active", label: "Actief" },
  { value: "disabled", label: "Uitgeschakeld" },
];

const STATUS_BADGE: Record<
  SiteMember["status"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  invited: { label: "Uitgenodigd", variant: "secondary" },
  active: { label: "Actief", variant: "outline" },
  disabled: { label: "Uitgeschakeld", variant: "destructive" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TeamSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [members, setMembers] = useState<SiteMember[]>([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<SiteMember["role"]>("editor");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSiteInUrl(nextSiteId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("siteId", nextSiteId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    async function loadSites() {
      setLoadingSites(true);
      try {
        const res = await fetch("/api/sites");
        const data = await res.json();
        const list: Site[] = data.sites ?? [];
        setSites(list);

        if (list.length === 0) return;
        const siteFromUrl = searchParams.get("siteId");
        if (siteFromUrl && list.some((site) => site.id === siteFromUrl)) {
          setSiteId(siteFromUrl);
          return;
        }

        setSiteId(list[0].id);
        updateSiteInUrl(list[0].id);
      } finally {
        setLoadingSites(false);
      }
    }

    loadSites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!siteId) {
      setMembers([]);
      return;
    }
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/site-members?siteId=${encodeURIComponent(siteId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Teamleden ophalen mislukt");
        setMembers([]);
        return;
      }
      setError(null);
      setMembers(data.members ?? []);
    } finally {
      setLoadingMembers(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  async function addMember() {
    if (!siteId || !newEmail.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/site-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          memberEmail: newEmail.trim(),
          role: newRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Teamlid toevoegen mislukt");
        return;
      }

      setError(null);
      setNewEmail("");
      setMembers((prev) => [data.member as SiteMember, ...prev]);
    } finally {
      setCreating(false);
    }
  }

  async function updateMember(
    memberId: string,
    updates: Partial<Pick<SiteMember, "role" | "status">>
  ) {
    const res = await fetch("/api/site-members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId, ...updates }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Lid bijwerken mislukt");
      return;
    }
    setError(null);
    setMembers((prev) =>
      prev.map((member) => (member.id === memberId ? (data.member as SiteMember) : member))
    );
  }

  async function deleteMember(memberId: string) {
    const confirmed = window.confirm("Weet je zeker dat je dit teamlid wilt verwijderen?");
    if (!confirmed) return;

    const res = await fetch("/api/site-members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memberId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Lid verwijderen mislukt");
      return;
    }
    setError(null);
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
  }

  function handleSiteChange(nextSiteId: string) {
    setSiteId(nextSiteId);
    updateSiteInUrl(nextSiteId);
  }

  const isReady = useMemo(() => !loadingSites && siteId, [loadingSites, siteId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team & Rechten</h1>
          <p className="mt-1 text-muted-foreground">
            Beheer subgebruikers per workspace en wijs rollen toe.
          </p>
        </div>

        {sites.length > 1 && (
          <NativeSelect
            value={siteId}
            onChange={(e) => handleSiteChange(e.target.value)}
            className="w-56"
          >
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          `Admin`: kan workspace-instellingen beheren. `Editor`: kan content beheren.
          `Viewer`: alleen inzage. V1: dit beheert rollen en ledenregistratie; volledige
          rechten-afdwinging en invite-login flow volgt in de volgende stap.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="font-semibold">Subgebruiker toevoegen</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="naam@klant.nl"
            className="sm:flex-1"
          />
          <NativeSelect
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as SiteMember["role"])}
            className="sm:w-40"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </NativeSelect>
          <Button onClick={addMember} disabled={!isReady || creating || !newEmail.trim()}>
            {creating ? "Toevoegen..." : "Toevoegen"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Teamleden</h2>
        </div>

        {!isReady || loadingMembers ? (
          <div className="space-y-2 p-4">
            {[...Array(3)].map((_, idx) => (
              <Skeleton key={idx} className="h-12 w-full" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nog geen subgebruikers voor deze workspace.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    E-mail
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Rol
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Toegevoegd
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Acties
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{member.member_email}</td>
                    <td className="px-4 py-3">
                      <NativeSelect
                        value={member.role}
                        onChange={(e) =>
                          updateMember(member.id, {
                            role: e.target.value as SiteMember["role"],
                          })
                        }
                        className="h-8 w-32 text-xs"
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </NativeSelect>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={STATUS_BADGE[member.status].variant}>
                          {STATUS_BADGE[member.status].label}
                        </Badge>
                        <NativeSelect
                          value={member.status}
                          onChange={(e) =>
                            updateMember(member.id, {
                              status: e.target.value as SiteMember["status"],
                            })
                          }
                          className="h-8 w-36 text-xs"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </NativeSelect>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(member.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteMember(member.id)}
                        className="text-xs font-medium text-muted-foreground hover:text-destructive"
                      >
                        Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
