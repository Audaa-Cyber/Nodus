"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, BarChart3, BookOpen, Clock3, FileText, Globe2, LayoutDashboard, Plus, Search, Settings2, ShieldCheck, Sparkles, Users, ScrollText } from "lucide-react";
import { StudioSignOut } from "@/components/studio-signout";
import { StudioGovernance } from "@/components/studio-governance";

type DocumentKind = "homepage" | "feature" | "faq" | "announcement" | "changelog" | "legal";
type CmsDocument = { id: string; kind: DocumentKind; slug: string; title: string; status: "draft" | "published" | "archived"; content: Record<string, unknown>; seo: Record<string, unknown>; updated_at: string; published_at: string | null };
type Revision = { id: string; document_id: string; version: number; title: string; status: string; changed_by: string; change_note: string | null; created_at: string };
type Analytics = { pageViews: number; uniqueVisitors: number; ctaClicks: number; trends?: {pageViews:number|null;uniqueVisitors:number|null;ctaClicks:number|null}; topPages: {label:string;count:number}[]; referrers: {label:string;count:number}[]; daily: {date:string;count:number}[]; topCtas: {label:string;count:number}[] };

const kinds: {value:DocumentKind;label:string}[] = [
  {value:"homepage",label:"Homepage"}, {value:"feature",label:"Features"},
  {value:"faq",label:"FAQs"}, {value:"announcement",label:"Announcements"},
  {value:"changelog",label:"Changelog"}, {value:"legal",label:"Legal pages"},
];
const blank = (): Partial<CmsDocument> => ({kind:"feature",slug:"new-page",title:"Untitled entry",status:"draft",content:{body:"",sections:[]},seo:{title:"",description:"",socialImage:""}});
const trendLabel = (value:number|undefined|null) => value === undefined || value === null ? "Baseline collecting" : `${value > 0 ? "+" : ""}${value}% vs previous period`;

export function StudioDashboard({adminEmail,adminRole}:{adminEmail:string;adminRole:"owner"|"admin"|"editor"|"analyst"}) {
  const [section,setSection] = useState<"overview"|"content"|"analytics"|"history"|"team"|"activity"|"settings">("overview");
  const [documents,setDocuments] = useState<CmsDocument[]>([]);
  const [revisions,setRevisions] = useState<Revision[]>([]);
  const [analytics,setAnalytics] = useState<Analytics|null>(null);
  const [range,setRange] = useState<7|30>(30);
  const [active,setActive] = useState<Partial<CmsDocument>|null>(null);
  const [filter,setFilter] = useState("all");
  const [query,setQuery] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [previewOpen,setPreviewOpen] = useState(false);
  const canEdit = adminRole === "owner" || adminRole === "admin" || adminRole === "editor";

  const load = useCallback(async () => {
    const [contentResponse,analyticsResponse] = await Promise.all([fetch("/api/studio/content",{cache:"no-store"}),fetch("/api/studio/analytics?range="+range,{cache:"no-store"})]);
    if(contentResponse.status===404 || analyticsResponse.status===404) { window.location.reload(); return; }
    if(contentResponse.ok) { const data=await contentResponse.json(); setDocuments(data.documents??[]); setRevisions(data.revisions??[]); }
    if(analyticsResponse.ok) setAnalytics(await analyticsResponse.json());
  },[range]);
  useEffect(()=>{ void load(); },[load]);

  const visible = useMemo(()=>documents.filter((item)=>(filter==="all"||item.kind===filter)&&(item.title.toLowerCase().includes(query.toLowerCase())||item.slug.includes(query.toLowerCase()))),[documents,filter,query]);
  const save = async (status?: "draft"|"published") => {
    if(!active) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const content = { ...(active.content ?? {}) };
      if (active.kind === "homepage") {
        const rawSections = String(content.sectionsDraft ?? JSON.stringify(content.sections ?? [], null, 2));
        let sections: unknown;
        try { sections = JSON.parse(rawSections); } catch { throw new Error("Homepage sections must be valid JSON."); }
        if (!Array.isArray(sections)) throw new Error("Homepage sections must be a JSON array.");
        content.sections = sections;
        delete content.sectionsDraft;
      }
      const response=await fetch("/api/studio/content",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...active,content,status:status??active.status,changeNote:status==="published"?"Published from Nodus Studio":"Saved from Nodus Studio"})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error??"Could not save content.");
      setMessage(status==="published"?"Content published.":"Draft saved.");
      setActive(null); await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not save content."); }
    finally { setBusy(false); }
  };
  const archive = async (id:string) => {
    if(!window.confirm("Archive this content entry? It will no longer be available as published content.")) return;
    const response=await fetch("/api/studio/content?id="+encodeURIComponent(id),{method:"DELETE"});
    if(response.ok) { setActive(null); await load(); } else setError("Could not archive this entry.");
  };
  const metric = (label:string,value:string,detail:string,icon:React.ReactNode) => <div className="studio-metric"><div className="studio-metric-top"><span>{label}</span><span className="studio-icon">{icon}</span></div><strong>{value}</strong><small>{detail}</small></div>;

  return <main className="studio-root">
    <aside className="studio-sidebar">
      <a className="studio-brand" href="/"><span className="studio-brand-mark">N</span><span>nodus<span>.</span><small>STUDIO</small></span></a>
      <div className="studio-side-label">WORKSPACE</div>
      <nav className="studio-nav">
        <button className={section==="overview"?"active":""} onClick={()=>{setSection("overview");setActive(null)}}><LayoutDashboard/>Overview</button>
        <button className={section==="content"?"active":""} onClick={()=>{setSection("content");setActive(null)}}><FileText/>Content</button>
        <button className={section==="analytics"?"active":""} onClick={()=>{setSection("analytics");setActive(null)}}><BarChart3/>Analytics</button>
        <button className={section==="history"?"active":""} onClick={()=>{setSection("history");setActive(null)}}><Clock3/>History</button>
        {adminRole==="owner"&&<button className={section==="team"?"active":""} onClick={()=>{setSection("team");setActive(null)}}><Users/>Access & roles</button>}
        <button className={section==="activity"?"active":""} onClick={()=>{setSection("activity");setActive(null)}}><ScrollText/>Audit activity</button>
        {(adminRole==="owner"||adminRole==="admin")&&<button className={section==="settings"?"active":""} onClick={()=>{setSection("settings");setActive(null)}}><Settings2/>Settings</button>}
      </nav>
      <div className="studio-sidebar-bottom"><ShieldCheck size={15}/><span>Restricted workspace</span></div>
    </aside>
    <section className="studio-main">
      <header className="studio-topbar"><div><span className="studio-overline">NODUS / PRIVATE WORKSPACE</span><h1>{active?"Edit content":section==="overview"?"Overview":section==="content"?"Content library":section==="analytics"?"Website analytics":section==="history"?"Content history":section==="team"?"Access & roles":section==="activity"?"Audit activity":"System settings"}</h1></div><div className="studio-user"><span className="studio-avatar">{adminEmail.charAt(0).toUpperCase()}</span><span>{adminEmail}</span><StudioSignOut /></div></header>
      {message&&<p className="studio-notice">{message}</p>}{error&&<p className="studio-error">{error}</p>}
      {active ? <section className="studio-editor">
        <div className="studio-editor-head"><div><span className="studio-overline">CONTENT EDITOR</span><h2>{active.title}</h2></div><div><button className="studio-quiet" onClick={()=>setPreviewOpen(value=>!value)}>{previewOpen?"Hide preview":"Preview"}</button> <button className="studio-quiet" onClick={()=>{setActive(null);setPreviewOpen(false)}}>Close editor</button></div></div>
        {!canEdit&&<p className="studio-notice">Your role has read-only content access. Ask an owner or editor to make changes.</p>}<div className="studio-form-grid">
          <label>Content type<select disabled={!canEdit} value={active.kind??"feature"} onChange={e=>setActive({...active,kind:e.target.value as DocumentKind})}>{kinds.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
          <label>URL slug<input readOnly={!canEdit} value={active.slug??""} onChange={e=>setActive({...active,slug:e.target.value.toLowerCase().replace(/[^a-z0-9/_-]/g,"-")})}/></label>
          <label className="wide">Title<input readOnly={!canEdit} value={active.title??""} onChange={e=>setActive({...active,title:e.target.value})}/></label>
          {active.kind==="homepage"&&<><label className="wide">Hero headline<input readOnly={!canEdit} value={String(active.content?.heroTitle??"")} onChange={e=>setActive({...active,content:{...active.content,heroTitle:e.target.value}})} placeholder="Itemized invoices. Payments made clear."/></label><label className="wide">Hero description<textarea readOnly={!canEdit} rows={3} value={String(active.content?.heroDescription??"")} onChange={e=>setActive({...active,content:{...active.content,heroDescription:e.target.value}})} placeholder="Describe what Nodus does."/></label><label>Primary CTA label<input readOnly={!canEdit} value={String(active.content?.ctaLabel??"")} onChange={e=>setActive({...active,content:{...active.content,ctaLabel:e.target.value}})} placeholder="Log in"/></label><label>Primary CTA destination<input readOnly={!canEdit} value={String(active.content?.ctaHref??"")} onChange={e=>setActive({...active,content:{...active.content,ctaHref:e.target.value}})} placeholder="/login?next=%2Fdashboard"/></label><label className="wide">Homepage sections · JSON array<textarea readOnly={!canEdit} rows={8} value={String(active.content?.sectionsDraft??JSON.stringify(active.content?.sections??[],null,2))} onChange={e=>setActive({...active,content:{...active.content,sectionsDraft:e.target.value}})} placeholder={'[{"eyebrow":"SECTION","title":"A clear message","body":"Section copy"}]'}/></label></>}<label className="wide">Body / answer / section copy<textarea readOnly={!canEdit} rows={active.kind==="homepage"?5:12} value={String(active.content?.body??"")} onChange={e=>setActive({...active,content:{...active.content,body:e.target.value}})} placeholder="Write the public-facing content here. Keep it clear and concise."/></label>
          <label>SEO title<input readOnly={!canEdit} value={String(active.seo?.title??"")} onChange={e=>setActive({...active,seo:{...active.seo,title:e.target.value}})}/></label>
          <label>SEO description<textarea readOnly={!canEdit} rows={3} value={String(active.seo?.description??"")} onChange={e=>setActive({...active,seo:{...active.seo,description:e.target.value}})}/></label>
          <label className="wide">Social preview image URL<input readOnly={!canEdit} value={String(active.seo?.socialImage??"")} onChange={e=>setActive({...active,seo:{...active.seo,socialImage:e.target.value}})} placeholder="https://…"/></label>
        </div>
        {previewOpen&&<div className="studio-preview"><span className="studio-overline">LIVE PREVIEW</span><h2>{String(active.content?.heroTitle??active.title??"Untitled")}</h2><p>{String(active.content?.heroDescription??active.content?.body??"Your content preview will appear here.")}</p>{active.content?.ctaLabel&&<span className="studio-preview-cta">{String(active.content.ctaLabel)}</span>}</div>}<div className="studio-editor-actions"><span>Current state: {active.status??"draft"}{!canEdit&&" · Read only"}</span>{canEdit&&<div><button className="studio-quiet" onClick={()=>save("draft")} disabled={busy}>Save draft</button><button className="studio-primary" onClick={()=>save("published")} disabled={busy}>Publish</button></div>}</div>
      </section> : <>
        {section==="overview"&&<><div className="studio-welcome"><div><span className="studio-overline">CONTENT OPERATIONS</span><h2>Your public website,<br/>kept in good shape.</h2><p>Manage what visitors see and understand how they find Nodus.</p></div>{canEdit&&<button className="studio-primary" onClick={()=>{setActive(blank());setSection("content")}}><Plus size={16}/>New content</button>}</div><div className="studio-metrics">{metric("PAGE VIEWS",String(analytics?.pageViews??"—"),trendLabel(analytics?.trends?.pageViews),<Activity/>)}{metric("UNIQUE VISITORS",String(analytics?.uniqueVisitors??"—"),trendLabel(analytics?.trends?.uniqueVisitors),<Globe2/>)}{metric("CTA CLICKS",String(analytics?.ctaClicks??"—"),trendLabel(analytics?.trends?.ctaClicks),<ArrowUpRight/>)}{metric("PUBLISHED CONTENT",String(documents.filter(d=>d.status==="published").length),"Across all content types",<BookOpen/>)}</div><div className="studio-panel"><div className="studio-panel-head"><div><span className="studio-overline">PERFORMANCE</span><h3>Page views over time</h3></div><button className="studio-link" onClick={()=>setSection("analytics")}>View analytics <ArrowUpRight size={14}/></button></div><div className="studio-bars">{(analytics?.daily??[]).map(d=><div key={d.date} title={d.date+": "+d.count+" views"}><span style={{height:Math.max(4,100*d.count/Math.max(1,...(analytics?.daily??[]).map(x=>x.count)))+"%"}}/><small>{d.date.slice(5)}</small></div>)}</div></div><div className="studio-panel"><div className="studio-panel-head"><div><span className="studio-overline">RECENT CHANGES</span><h3>Latest content</h3></div><button className="studio-link" onClick={()=>setSection("content")}>All content <ArrowUpRight size={14}/></button></div><DocumentList documents={documents.slice(0,5)} onEdit={setActive}/></div></>}
        {section==="content"&&<div className="studio-panel"><div className="studio-panel-head"><div><span className="studio-overline">CONTENT LIBRARY</span><h3>Public website content</h3></div>{canEdit&&<button className="studio-primary" onClick={()=>setActive(blank())}><Plus size={16}/>New entry</button>}</div><div className="studio-toolbar"><div className="studio-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search content"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All types</option>{kinds.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}</select></div><DocumentList documents={visible} onEdit={setActive}/></div>}
        {section==="analytics"&&<><div className="studio-analytics-tools"><span>Privacy-conscious website analytics</span><select value={range} onChange={e=>setRange(Number(e.target.value) as 7|30)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select></div><div className="studio-metrics">{metric("PAGE VIEWS",String(analytics?.pageViews??"—"),trendLabel(analytics?.trends?.pageViews),<Activity/>)}{metric("UNIQUE VISITORS",String(analytics?.uniqueVisitors??"—"),trendLabel(analytics?.trends?.uniqueVisitors),<Globe2/>)}{metric("CTA CLICKS",String(analytics?.ctaClicks??"—"),trendLabel(analytics?.trends?.ctaClicks),<ArrowUpRight/>)}{metric("CONTENT ITEMS",String(documents.length),"Drafts and published entries",<BookOpen/>)}</div><div className="studio-two-col"><div className="studio-panel"><div className="studio-panel-head"><h3>Top pages</h3></div><RankList items={analytics?.topPages??[]}/></div><div className="studio-panel"><div className="studio-panel-head"><h3>Referrers</h3></div><RankList items={analytics?.referrers??[]}/></div><div className="studio-panel"><div className="studio-panel-head"><h3>CTA performance</h3></div><RankList items={analytics?.topCtas??[]}/></div><div className="studio-panel"><div className="studio-panel-head"><h3>Daily traffic</h3></div><RankList items={(analytics?.daily??[]).map(d=>({label:d.date,count:d.count}))}/></div></div></>}
        {section==="history"&&<div className="studio-panel"><div className="studio-panel-head"><div><span className="studio-overline">AUDIT TRAIL</span><h3>Version history</h3></div></div><div className="studio-history">{revisions.map(revision=><div key={revision.id}><span className="studio-version">V{revision.version}</span><div><strong>{revision.title}</strong><small>{revision.status} · {new Date(revision.created_at).toLocaleString()} · {revision.changed_by}</small>{revision.change_note&&<p>{revision.change_note}</p>}</div></div>)}</div></div>}
        {(section==="team"||section==="activity"||section==="settings")&&<StudioGovernance section={section} role={adminRole}/>}
      </>}
      <footer className="studio-footer"><span>NODUS STUDIO · PRIVATE</span><span>Content operations, not customer financial records.</span></footer>
    </section>
  </main>;
}

function DocumentList({documents,onEdit}:{documents:CmsDocument[];onEdit:(document:CmsDocument)=>void}) {
  if(!documents.length) return <div className="studio-empty"><Sparkles size={20}/><strong>No content yet</strong><span>Create your first page or content entry.</span></div>;
  return <div className="studio-doc-list">{documents.map(doc=><button key={doc.id} onClick={()=>onEdit(doc)}><span className="studio-doc-kind">{doc.kind}</span><span className="studio-doc-title"><strong>{doc.title}</strong><small>/{doc.slug} · Updated {new Date(doc.updated_at).toLocaleDateString()}</small></span><span className={"studio-status "+doc.status}>{doc.status}</span><ArrowUpRight size={15}/></button>)}</div>;
}
function RankList({items}:{items:{label:string;count:number}[]}) {
  if(!items.length) return <p className="studio-muted">No data collected yet.</p>;
  const max=Math.max(...items.map(x=>x.count),1);
  return <div className="studio-rank-list">{items.map(item=><div key={item.label}><div><span>{item.label}</span><strong>{item.count.toLocaleString()}</strong></div><span className="studio-rank-track"><i style={{width:(100*item.count/max)+"%"}}/></span></div>)}</div>;
}
