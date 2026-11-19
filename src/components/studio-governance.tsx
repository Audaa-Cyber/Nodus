"use client";

import { FormEvent, useEffect, useState } from "react";
import { Activity, Check, Plus, RefreshCw, Save, Shield, Users } from "lucide-react";
import type { CmsAdminRole } from "@/lib/cms/admin";

type GovernanceSection = "team" | "activity" | "settings";
type AdminRecord = { id:string; workos_user_id:string; email:string; display_name:string|null; role:CmsAdminRole; is_active:boolean; created_at:string; last_seen_at:string|null };
type AuditRecord = { id:string; actor_email:string|null; action:string; resource_type:string; summary:string; created_at:string };
type SettingRecord = { key:string; value:unknown; description:string|null; updated_at:string; updated_by:string|null };

const settingOptions = [
  { key:"public_site.announcement_banner", label:"Announcement banner", description:"Public site banner copy and visibility.", value:{ enabled:false, text:"" } },
  { key:"public_site.maintenance_mode", label:"Maintenance mode", description:"Maintenance-mode flag for a future public-site gate.", value:{ enabled:false } },
  { key:"features.faq_enabled", label:"FAQs section", description:"Feature flag for the public FAQ section.", value:{ enabled:true } },
  { key:"features.changelog_enabled", label:"Changelog", description:"Feature flag for the public changelog.", value:{ enabled:true } },
  { key:"seo.default_title", label:"Default SEO title", description:"Fallback title for pages without a custom SEO title.", value:"Nodus — Business payments, made clear" },
  { key:"seo.default_description", label:"Default SEO description", description:"Fallback description for pages without custom metadata.", value:"Create itemized invoices, share a QR checkout, and keep payment status clear." },
];

export function StudioGovernance({ section, role }: { section:GovernanceSection; role:CmsAdminRole }) {
  const [admins,setAdmins] = useState<AdminRecord[]>([]);
  const [events,setEvents] = useState<AuditRecord[]>([]);
  const [settings,setSettings] = useState<SettingRecord[]>([]);
  const [workosUserId,setWorkosUserId] = useState("");
  const [email,setEmail] = useState("");
  const [displayName,setDisplayName] = useState("");
  const [newRole,setNewRole] = useState<"admin"|"editor"|"analyst">("editor");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  const load = async () => {
    setError("");
    const endpoint = section === "team" ? "/api/studio/team" : section === "activity" ? "/api/studio/audit" : "/api/studio/settings";
    const response = await fetch(endpoint,{cache:"no-store"});
    const data = await response.json().catch(()=>({}));
    if(!response.ok) { setError(data.error??"Could not load this section."); return; }
    if(section==="team") setAdmins(data.admins??[]);
    if(section==="activity") setEvents(data.events??[]);
    if(section==="settings") setSettings(data.settings??[]);
  };

  useEffect(()=>{ void load(); },[section]);

  const addAdmin = async (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response=await fetch("/api/studio/team",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workosUserId,email,displayName,role:newRole})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error??"Could not grant access.");
      setWorkosUserId("");setEmail("");setDisplayName("");setNewRole("editor");
      setNotice("Access granted. The new admin can sign in with their existing WorkOS account.");
      await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not grant access."); }
    finally { setBusy(false); }
  };

  const updateAdmin = async (admin:AdminRecord, nextRole:CmsAdminRole, isActive:boolean) => {
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/studio/team",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:admin.id,role:nextRole,isActive})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error??"Could not update access.");
      setNotice("Admin access updated.");await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not update access."); }
    finally { setBusy(false); }
  };

  const saveSetting = async (key:string, raw:string) => {
    setBusy(true);setError("");setNotice("");
    let value:unknown;
    try { value=JSON.parse(raw); } catch { setError("Setting values must be valid JSON.");setBusy(false);return; }
    try {
      const option=settingOptions.find(item=>item.key===key);
      const response=await fetch("/api/studio/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({key,value,description:option?.description})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error??"Could not save this setting.");
      setNotice("Setting saved.");await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not save this setting."); }
    finally { setBusy(false); }
  };

  return <div className="studio-governance">
    {error&&<p className="studio-error" role="alert">{error}</p>}
    {notice&&<p className="studio-notice" role="status">{notice}</p>}
    {section==="team"&&<section className="studio-panel">
      <div className="studio-panel-head"><div><span className="studio-overline">GOVERNANCE / RBAC</span><h3>Access & roles</h3></div><span className="studio-role-pill"><Shield size={13}/> OWNER ONLY</span></div>
      <p className="studio-muted">Add existing WorkOS accounts. This grants Nodus Studio access only, not access to customer invoices or payment records.</p>
      <form className="studio-admin-form" onSubmit={addAdmin}>
        <label>WorkOS user ID<input value={workosUserId} onChange={e=>setWorkosUserId(e.target.value)} placeholder="user_..." required/></label>
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
        <label>Display name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Optional"/></label>
        <label>Role<select value={newRole} onChange={e=>setNewRole(e.target.value as "admin"|"editor"|"analyst")}><option value="admin">Admin</option><option value="editor">Editor</option><option value="analyst">Analyst</option></select></label>
        <button className="studio-primary" disabled={busy}><Plus size={14}/>Grant access</button>
      </form>
      <div className="studio-panel-head studio-governance-subhead"><div><span className="studio-overline">AUTHORIZED PEOPLE</span><h3>Studio team</h3></div><button className="studio-quiet" onClick={()=>void load()} disabled={busy}><RefreshCw size={13}/>Refresh</button></div>
      <div className="studio-admin-list">
        {admins.map(admin=><AdminRow key={admin.id} admin={admin} busy={busy} onSave={updateAdmin}/>)}
        {!admins.length&&<p className="studio-muted">No admin accounts are registered.</p>}
      </div>
    </section>}

    {section==="activity"&&<section className="studio-panel">
      <div className="studio-panel-head"><div><span className="studio-overline">GOVERNANCE / AUDIT TRAIL</span><h3>Recent system activity</h3></div><button className="studio-quiet" onClick={()=>void load()}><RefreshCw size={13}/>Refresh</button></div>
      <div className="studio-audit-list">
        {events.map(event=><div className="studio-audit-row" key={event.id}><span className="studio-audit-icon"><Activity size={14}/></span><div><strong>{event.summary}</strong><small>{event.actor_email??"System"} · {event.action} · {event.resource_type}</small></div><time>{new Date(event.created_at).toLocaleString()}</time></div>)}
        {!events.length&&<p className="studio-muted">No audit events have been recorded yet.</p>}
      </div>
    </section>}

    {section==="settings"&&<section className="studio-panel">
      <div className="studio-panel-head"><div><span className="studio-overline">SYSTEM / SAFE CONFIGURATION</span><h3>Public site settings</h3></div><span className="studio-role-pill">NO SECRETS</span></div>
      <p className="studio-muted">Only non-secret website settings are editable here. API keys, wallet secrets, payment configuration, and billing credentials stay outside the CMS.</p>
      <div className="studio-settings-list">
        {settingOptions.map(option=>{
          const existing=settings.find(item=>item.key===option.key);
          return <SettingRow key={option.key} settingKey={option.key} label={option.label} description={option.description} initialValue={existing?.value??option.value} busy={busy} onSave={saveSetting}/>;
        })}
      </div>
    </section>}
  </div>;
}

function AdminRow({admin,busy,onSave}:{admin:AdminRecord;busy:boolean;onSave:(admin:AdminRecord,role:CmsAdminRole,active:boolean)=>void}) {
  const [role,setRole]=useState<CmsAdminRole>(admin.role);
  const [active,setActive]=useState(admin.is_active);
  useEffect(()=>{setRole(admin.role);setActive(admin.is_active)},[admin.role,admin.is_active]);
  return <div className="studio-admin-row">
    <div className="studio-admin-person"><span className="studio-admin-avatar">{(admin.display_name??admin.email).charAt(0).toUpperCase()}</span><span><strong>{admin.display_name||admin.email}</strong><small>{admin.email} · {admin.workos_user_id}</small></span></div>
    <select value={role} onChange={e=>setRole(e.target.value as CmsAdminRole)} aria-label={"Role for "+admin.email}><option value="owner">Owner</option><option value="admin">Admin</option><option value="editor">Editor</option><option value="analyst">Analyst</option></select>
    <select value={String(active)} onChange={e=>setActive(e.target.value==="true")} aria-label={"Access for "+admin.email}><option value="true">Active</option><option value="false">Disabled</option></select>
    <button className="studio-quiet" disabled={busy||role===admin.role&&active===admin.is_active} onClick={()=>onSave(admin,role,active)}><Save size={13}/>Save</button>
  </div>;
}

function SettingRow({settingKey,label,description,initialValue,busy,onSave}:{settingKey:string;label:string;description:string;initialValue:unknown;busy:boolean;onSave:(key:string,raw:string)=>void}) {
  const [raw,setRaw]=useState(JSON.stringify(initialValue,null,2));
  useEffect(()=>setRaw(JSON.stringify(initialValue,null,2)),[initialValue]);
  return <div className="studio-setting-row">
    <div><strong>{label}</strong><small>{description}</small><code>{settingKey}</code></div>
    <textarea rows={3} value={raw} onChange={e=>setRaw(e.target.value)} aria-label={label+" JSON value"}/>
    <button className="studio-quiet" disabled={busy} onClick={()=>onSave(settingKey,raw)}><Check size={13}/>Save</button>
  </div>;
}
