import Link from "next/link";

export default function TermsPage() {
  return <main className="policy-page">
    <Link className="policy-back" href="/">← Back to MarketLink</Link>
    <span className="eyebrow">MARKETLINK · DEMONSTRATION TERMS</span>
    <h1>A marketplace built around trust.</h1>
    <p className="policy-lead">MarketLink is currently a hackathon-style product demonstration. Sample listings, seller accounts, reviews, analytics and approval states are illustrative only.</p>
    <section><h2>No live transactions</h2><p>Demo checkout does not charge a payment method, reserve real goods, create a production order or issue a settlement. Do not rely on sample prices, stock, vendor verification or delivery information.</p></section>
    <section><h2>Vendor onboarding</h2><p>Do not upload genuine business or identity documents to the demo. Vendor verification and facial liveness checks are not connected. A local sandbox approval is not a real identity check, seller approval or storefront publication.</p></section>
    <section><h2>Future service terms</h2><p>Real vendor eligibility, payment/refund terms, delivery and dispute rules, commissions, settlement arrangements, content moderation and legal responsibilities must be reviewed and published before launch. This demonstration is not legal or financial advice.</p></section>
    <section><h2>Privacy</h2><p>See the <Link href="/privacy">MarketLink privacy notice</Link>. No production customer data should be entered in this prototype.</p></section>
  </main>;
}
