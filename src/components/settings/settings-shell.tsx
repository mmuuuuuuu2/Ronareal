"use client";

import { useCallback, useState } from "react";
import { AccountSection } from "@/components/settings/account-section";
import { PageSection } from "@/components/settings/page-section";
import { SeoSection } from "@/components/settings/seo-section";
import { StatusSection } from "@/components/settings/status-section";
import { UsernameSection } from "@/components/settings/username-section";
import { Tabs, tabIds } from "@/components/ui/tabs";
import { Toast } from "@/components/ui/toast";
import type { SettingsData } from "@/lib/settings/load";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings/tabs";

export function SettingsShell({ initial, siteUrl, initialTab }: { initial: SettingsData; siteUrl: string | null; initialTab: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [username, setUsername] = useState(initial.profile.username);
  const [displayName, setDisplayName] = useState(initial.profile.displayName);
  const [bio, setBio] = useState(initial.profile.bio);
  const [profileRev, setProfileRev] = useState(initial.profile.rev);
  const [publish, setPublish] = useState(initial.publish);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const anyDirty = Object.values(dirty).some(Boolean);

  const markDirty = (k: string) => (d: boolean) => setDirty((p) => (p[k] === d ? p : { ...p, [k]: d }));
  const signedOut = useCallback(() => window.location.assign("/login?next=%2Fdashboard%2Fsettings"), []);
  const dismiss = useCallback(() => setToast(null), []);
  const change = (t: SettingsTab) => {
    setTab(t);
    try { window.history.replaceState(null, "", `/dashboard/settings?tab=${t}`); } catch { /* abaikan */ }
  };

  const panels: Record<SettingsTab, React.ReactNode> = {
    akun: (
      <AccountSection
        email={initial.email} username={username} displayName={displayName} profileRev={profileRev}
        lastSignInAt={initial.lastSignInAt} createdAt={initial.createdAt}
        onSaved={(n) => { setDisplayName(n.displayName); setProfileRev(n.profileRev); }}
        onDirty={markDirty("akun")} onSignedOut={signedOut} onNotify={setToast}
      />
    ),
    username: (
      <UsernameSection
        username={username} isPublished={publish.isPublished} siteUrl={siteUrl}
        onChanged={(n) => { setUsername(n.username); if (n.profileRev >= 0) setProfileRev(n.profileRev); }}
        onDirty={markDirty("username")} onSignedOut={signedOut} onNotify={setToast}
      />
    ),
    halaman: (
      <PageSection
        displayName={displayName} bio={bio} profileRev={profileRev} isPublished={publish.isPublished}
        onSaved={(n) => { setBio(n.bio); setProfileRev(n.profileRev); setPublish((p) => ({ ...p, hasChanges: true })); }}
        onDirty={markDirty("halaman")} onGoto={change} onSignedOut={signedOut} onNotify={setToast}
      />
    ),
    seo: (
      <SeoSection
        initial={initial.seo} seoRev={initial.seoRev} username={username} displayName={displayName} bio={bio} siteUrl={siteUrl}
        onDirty={markDirty("seo")} onSignedOut={signedOut} onNotify={setToast}
      />
    ),
    status: (
      <StatusSection
        state={publish} username={username} siteUrl={siteUrl} dirty={anyDirty}
        onState={(s, u) => { setPublish(s); setUsername(u); }} onSignedOut={signedOut} onNotify={setToast}
      />
    ),
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pengaturan</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--rona-fg-muted)" }}>Akun, alamat halaman, SEO, dan status penerbitan.</p>
      </div>
      <Tabs tabs={[...SETTINGS_TABS]} value={tab} onChange={change} label="Bagian pengaturan" idPrefix="set" />
      <div className="mx-auto w-full max-w-2xl">
        {SETTINGS_TABS.map((t) => {
          const ids = tabIds("set", t.id);
          return (
            <div key={t.id} role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} hidden={tab !== t.id} tabIndex={0}>
              {panels[t.id]}
            </div>
          );
        })}
      </div>
      <Toast message={toast} kind="success" onDismiss={dismiss} />
    </div>
  );
}
