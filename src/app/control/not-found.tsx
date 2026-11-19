import Link from "next/link";

export default function ControlNotFound() {
  return <div className="control-error"><div className="control-error-inner"><span className="control-error-code">404 / CONTROL</span><h1>Nothing here.</h1><p>This control page is unavailable. If you believe you should have access, check your Nodus Control permissions.</p><Link className="control-button" href="/" style={{ marginTop: 22 }}>Return to Nodus</Link></div></div>;
}
