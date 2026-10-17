import Link from "next/link";

export default function PrivacyPage() {
  return <main className="policy-page">
    <Link className="policy-back" href="/">← Back to MarketLink</Link>
    <span className="eyebrow">MARKETLINK · PRIVACY NOTICE</span>
    <h1>Your trust is part of every transaction.</h1>
    <p className="policy-lead">This prototype is a sandbox and stores demonstration cart, order and workspace state in your browser. It does not collect real identity documents or facial biometrics.</p>
    <section><h2>Information used by a live service</h2><p>A configured service would process only the buyer, vendor, delivery, account and transaction details needed to provide marketplace services, prevent abuse, meet legal obligations and support a requested order. Do not submit real personal, payment or identity information to this demo.</p></section>
    <section><h2>Identity verification is not enabled</h2><p>MarketLink has no identity-verification provider configured. The sandbox does not request ID images, selfie capture, liveness checks or facial templates, and does not claim to verify anyone’s identity. Any future verification flow requires a selected, authorized provider, a separate privacy assessment, clear purpose-specific notice, explicit consent and a supported alternative.</p></section>
    <section><h2>Retention, access and security</h2><p>Production retention periods, processors, data-location choices, rights requests and incident contacts must be published and approved before launch. Sensitive identity-provider results are designed to be restricted to authorized administrators; raw identity images are not stored by this prototype.</p></section>
    <section><h2>Ghana legal review</h2><p>Before commercial launch, obtain qualified advice on Ghana data-protection and privacy obligations, cross-border processing, payment-services rules, consumer protections, identity checks and biometrics. This notice is a prototype summary, not legal advice.</p></section>
  </main>;
}
