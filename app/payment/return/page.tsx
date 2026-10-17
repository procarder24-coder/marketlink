import Link from "next/link";
import { Clock3, ShieldCheck } from "lucide-react";

export default function PaymentReturnPage() {
  return (
    <main className="payment-return">
      <section className="payment-return-card" aria-labelledby="payment-return-title">
        <span className="payment-return-icon"><Clock3 size={24} /></span>
        <span className="eyebrow">PAYMENT STATUS</span>
        <h1 id="payment-return-title">We’re verifying your payment</h1>
        <p>
          Your return from the payment provider is not proof of payment. MarketLink will update an
          order only after the signed provider notification and server-side transaction verification.
        </p>
        <div className="payment-return-note"><ShieldCheck size={16} /><span>Do not pay again while this payment is being checked.</span></div>
        <Link className="primary-button" href="/">Return to MarketLink</Link>
      </section>
    </main>
  );
}
