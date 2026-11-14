"use client";
export default function InvoicePrintButton(){return <button type="button" className="button button-outline no-print" onClick={()=>window.print()}>Print / Save PDF ↗</button>}