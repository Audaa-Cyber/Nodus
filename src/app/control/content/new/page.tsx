import Link from "next/link";
import { requireControlContext, canEditContent } from "@/lib/control/access";
import { saveContentAction } from "../actions";

export default async function NewContentPage() {
  const { role } = await requireControlContext();
  if (!canEditContent(role)) return <div className="control-error"><div className="control-error-inner"><span className="control-error-code">403 / READ ONLY</span><h1>Editing is restricted.</h1><p>Your role can review content, but cannot create or publish it.</p></div></div>;
  return (
    <>
      <div className="control-heading"><div><p className="control-kicker">CONTENT / NEW DRAFT</p><h1>Create content</h1><p>Start with a draft. Publish only after reviewing the preview and metadata.</p></div><Link className="control-button control-button-secondary" href="/control/content">Back to library</Link></div>
      <section className="control-card">
        <form action={saveContentAction} className="control-form">
          <div className="control-field"><label htmlFor="content_type">Content type</label><select id="content_type" name="content_type" defaultValue="page"><option value="homepage">Homepage</option><option value="feature">Feature</option><option value="faq">FAQ</option><option value="announcement">Announcement</option><option value="changelog">Changelog</option><option value="privacy">Privacy policy</option><option value="terms">Terms</option><option value="page">Page</option></select></div>
          <div className="control-field"><label htmlFor="title">Title</label><input id="title" name="title" required maxLength={160} placeholder="A clear title" /></div>
          <div className="control-field"><label htmlFor="slug">Slug</label><input id="slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="example-page" /></div>
          <div className="control-field"><label htmlFor="excerpt">Short description</label><textarea id="excerpt" name="excerpt" rows={2} /></div>
          <div className="control-field"><label htmlFor="body">Content body · JSON</label><textarea id="body" name="body" required defaultValue={'{\n  "heading": "",\n  "description": "",\n  "sections": [],\n  "cta": { "label": "", "href": "" }\n}'} /></div>
          <div className="control-callout">Use structured JSON for section data. This first CMS release stores and versions the content, but the public homepage still needs its section-by-section renderer connected before edits change the live layout.</div>
          <div className="control-field"><label htmlFor="seo_title">SEO title</label><input id="seo_title" name="seo_title" maxLength={70} /></div>
          <div className="control-field"><label htmlFor="seo_description">SEO description</label><textarea id="seo_description" name="seo_description" rows={2} maxLength={180} /></div>
          <div className="control-field"><label htmlFor="social_image_url">Social preview image URL</label><input id="social_image_url" name="social_image_url" type="url" placeholder="https://" /></div>
          <div className="control-form-actions"><button className="control-button" type="submit">Save draft</button><Link className="control-button control-button-secondary" href="/control/content">Cancel</Link></div>
        </form>
      </section>
    </>
  );
}
