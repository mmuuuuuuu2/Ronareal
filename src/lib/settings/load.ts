import { emailStatus, type EmailStatus } from "../account/account.ts";
import { revFrom } from "../editor/draft-save.ts";
import { parsePublishState, type PublishState } from "../publish/state.ts";
import { parseSeoFromConfig, type SeoSettings } from "../seo/seo.ts";
import { createSupabaseServerClient } from "../supabase/server.ts";

export type SettingsData = {
  userId: string;
  email: EmailStatus;
  lastSignInAt: string | null;
  createdAt: string | null;
  profile: { username: string; displayName: string; bio: string; rev: number };
  seo: SeoSettings;
  seoRev: number;
  publish: PublishState;
  everPublished: boolean;
};

/** Memuat semua data halaman pengaturan: 3 query paralel milik sesi (RLS), tanpa polling/query berulang. null = belum onboarding. */
export async function loadSettings(user: {
  id: string; email?: string | null; new_email?: string | null; last_sign_in_at?: string | null; created_at?: string | null;
}): Promise<SettingsData | null> {
  const supabase = await createSupabaseServerClient();
  const [profileRes, pageRes, stateRes] = await Promise.all([
    supabase.from("profiles").select("username, display_name, bio, profile_rev").eq("id", user.id).maybeSingle(),
    supabase.from("pages").select("draft_config, seo_rev").eq("owner_id", user.id).maybeSingle(),
    supabase.rpc("get_publish_state"),
  ]);
  if (profileRes.error || pageRes.error) throw new Error("Pengaturan tidak dapat dimuat.");
  if (!profileRes.data || !pageRes.data) return null;
  if (stateRes.error) throw new Error("Status halaman tidak dapat dimuat.");
  const p = profileRes.data as Record<string, unknown>;
  const publish = parsePublishState(stateRes.data);
  return {
    userId: user.id,
    email: emailStatus(user),
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: user.created_at ?? null,
    profile: {
      username: String(p.username),
      displayName: typeof p.display_name === "string" ? p.display_name : "",
      bio: typeof p.bio === "string" ? p.bio : "",
      rev: revFrom(p.profile_rev),
    },
    seo: parseSeoFromConfig((pageRes.data as { draft_config: unknown }).draft_config),
    seoRev: revFrom((pageRes.data as { seo_rev: unknown }).seo_rev),
    publish,
    everPublished: publish.version !== null,
  };
}
