"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeReviewUrl, type InvoiceFeedback } from "@/lib/invoice-feedback";

const messages = ["Needs work. Tell us what went wrong.", "Fair. We’ll do better.", "Good. Thank you!", "Great. Glad it went well!", "Exceptional. You made our day!"];
function Star({size=30}: {size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z" fill="currentColor" /></svg>;
}

export function InvoiceRating({shareToken, invoiceNumber, reviewUrl}: {shareToken?:string;invoiceNumber:string;reviewUrl?:string|null}) {
  const [value,setValue] = useState(0);
  const [preview,setPreview] = useState(0);
  const [message,setMessage] = useState("");
  const [url,setUrl] = useState(safeReviewUrl(reviewUrl) ?? "");
  const [pending,setPending] = useState(false);
  const writeLock = useRef(false);
  useEffect(() => {
    setUrl(safeReviewUrl(reviewUrl) ? new URL(safeReviewUrl(reviewUrl)!,window.location.origin).href : `${window.location.origin}${window.location.pathname}#receipt-review-section`);
    if (!shareToken) return;
    const abort = new AbortController();
    void fetch(`/api/pay/${encodeURIComponent(shareToken)}/feedback`,{cache:"no-store",signal:abort.signal})
      .then(response => response.ok ? response.json() : null)
      .then(result => {if(result?.feedback?.rating) setValue(result.feedback.rating);})
      .catch(() => {});
    return () => abort.abort();
  },[shareToken,reviewUrl]);
  async function rate(rating:number) {
    if (writeLock.current) return;
    if (!shareToken) {setMessage("Open the original invoice link to submit your feedback.");return;}
    writeLock.current=true;setPending(true);setMessage("Saving your rating…");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/feedback`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rating})});
      if (!response.ok) throw new Error("Your rating could not be saved. Please try again.");
      const result = await response.json();
      setValue(result.feedback.rating);
      setMessage(`Thanks for rating us ${rating} out of 5.`);
    } catch(error) {setMessage(error instanceof Error ? error.message : "Your rating could not be saved.");}
    finally {writeLock.current=false;setPending(false);}
  }
  const shown=preview||value;
  return <div className="fb" id="receipt-review-section">
    <div><h3>We’d love your feedback!</h3>
      <div className="stars" role="group" aria-label={`Rate your experience for invoice ${invoiceNumber}`}>
        {[1,2,3,4,5].map(rating => <button key={rating} type="button" className={rating<=shown?"on":""} aria-label={`${rating} ${rating===1?"star":"stars"}`} aria-pressed={rating===value} disabled={pending} onMouseEnter={()=>setPreview(rating)} onMouseLeave={()=>setPreview(0)} onFocus={()=>setPreview(rating)} onBlur={()=>setPreview(0)} onClick={()=>void rate(rating)}><Star /></button>)}
      </div>
      <div className="lbl" aria-live="polite">{message || (shown?messages[shown-1]:"Tap a star to rate your experience")}</div>
    </div>
    <a className="qr" href={url||"#receipt-review-section"} aria-label="Open review page">{url&&<QRCodeSVG value={url} size={92} marginSize={2} level="M" title="Scan to open the review page" />}Open &amp; Scan</a>
  </div>;
}

export function CustomerFeedback({invoiceId,customerName,initialFeedback}: {invoiceId:string;customerName?:string|null;initialFeedback?:InvoiceFeedback|null}) {
  const [feedback,setFeedback] = useState(initialFeedback??null);
  const [unavailable,setUnavailable] = useState(false);
  useEffect(()=>{
    const abort=new AbortController();
    const load=async()=>{
      try {
        const response=await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/feedback`,{cache:"no-store",signal:abort.signal});
        if(!response.ok) throw new Error("unavailable");
        const result=await response.json();setFeedback(result.feedback??null);setUnavailable(false);
      } catch {if(!abort.signal.aborted)setUnavailable(true);}
    };
    void load();
    const supabase=getSupabaseBrowserClient();
    const channel=supabase.channel(`invoice-feedback:${invoiceId}`).on("postgres_changes",{event:"*",schema:"public",table:"invoice_feedback",filter:`invoice_id=eq.${invoiceId}`},()=>void load()).subscribe();
    return ()=>{abort.abort();void supabase.removeChannel(channel);};
  },[invoiceId]);
  return <section className="card" data-s="paid">
    <p className="lab">Customer feedback</p>
    <div className="fb"><div><div className="sc">{feedback?feedback.rating.toFixed(1):"—"}</div><div className="stars" role="img" aria-label={feedback?`${feedback.rating} out of 5 stars`:"No rating yet"}>{[1,2,3,4,5].map(rating=><span key={rating} style={{color:feedback&&rating<=feedback.rating?undefined:"#d4d6d0"}}><Star size={20}/></span>)}</div></div>
      <div><blockquote>{feedback?(feedback.comment?`“${feedback.comment}”`:messages[feedback.rating-1]):unavailable?"Customer feedback is temporarily unavailable.":"No customer feedback yet."}</blockquote><cite>{feedback?(feedback.customer_name||customerName||"Customer"):customerName||"Customer"}{feedback?" · submitted from the Thank You Scroll":""}</cite></div>
    </div>
  </section>;
}
