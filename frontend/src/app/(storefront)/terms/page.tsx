import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section, Detail } from '@/components/legal/legal-page';
import { legal } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms on which we sell to you.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="The agreement between you and us when you shop here. Please read it before you place an order."
    >
      <Section heading="Who you are contracting with">
        <p>
          These terms are between you and{' '}
          <Detail value={legal.legalName} placeholder="registered business name" />, trading as{' '}
          {legal.siteName}, registered at{' '}
          <Detail value={legal.address} placeholder="registered address" />
          {legal.gstin ? `, GSTIN ${legal.gstin}` : ''}. Placing an order means you accept them.
        </p>
      </Section>

      <Section heading="Products and pricing">
        <p>
          All prices are in Indian Rupees and <strong>include GST</strong>. The price shown on the
          product page is the price you pay for that item; delivery and any cash-on-delivery
          handling charge are shown separately at checkout before you confirm.
        </p>
        <p>
          Our pieces are made in small batches, so colour and finish can vary slightly between
          items. Photographs are as accurate as we can make them, but screens differ.
        </p>
        <p>
          We try hard to keep prices and stock accurate. If an item is listed at an obviously wrong
          price, or sells out between your order and our picking it, we will contact you and either
          cancel and refund in full or offer an alternative. We do not charge you the higher price
          without asking.
        </p>
      </Section>

      <Section heading="Orders">
        <p>
          Your order is an offer to buy. The contract forms when we send you a dispatch
          confirmation, not when you pay. Until then we may decline an order — for example where we
          cannot verify payment, where the delivery address is outside our service area, or where we
          reasonably suspect fraud or resale.
        </p>
      </Section>

      <Section heading="Payment">
        <p>
          We accept cards, UPI, net banking and wallets through our payment gateway, and cash on
          delivery where available. Card details are handled by the gateway and never reach our
          servers. A cash-on-delivery order carries a handling charge of ₹{legal.codCharge}, shown
          at checkout, and must be paid in full to the courier at the door.
        </p>
      </Section>

      <Section heading="Delivery, returns and refunds">
        <p>
          Delivery timelines and charges are set out on the{' '}
          <Link href="/shipping" className="underline underline-offset-4">
            shipping page
          </Link>
          . Your rights to return, exchange and refund are set out on the{' '}
          <Link href="/returns" className="underline underline-offset-4">
            returns page
          </Link>
          . Both form part of these terms.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          Keep your password to yourself and tell us promptly if you think someone else has used
          your account. You are responsible for what happens under your login until you do. We may
          suspend an account that is being used fraudulently or to abuse other customers or our
          staff.
        </p>
      </Section>

      <Section heading="Reviews and content you post">
        <p>
          Reviews must be your own honest experience of something you actually bought. We moderate
          before publishing and will not publish content that is abusive, defamatory, deceptive, or
          infringes someone else&apos;s rights. By posting, you allow us to display and reproduce
          your review on the store and in our marketing.
        </p>
      </Section>

      <Section heading="Our content">
        <p>
          The photographs, text, designs and code on this site belong to us or our licensors. You
          may not copy or reuse them commercially without our written permission.
        </p>
      </Section>

      <Section heading="Liability">
        <p>
          We are responsible for delivering what you ordered, in the condition described. Where the
          law allows us to limit our liability, our total liability for any order is capped at the
          amount you paid for it. Nothing here limits liability for death or personal injury caused
          by our negligence, for fraud, or for anything else that cannot lawfully be limited — and
          nothing here reduces your rights under the Consumer Protection Act, 2019.
        </p>
      </Section>

      <Section heading="Events outside our control">
        <p>
          We are not liable for delays caused by things genuinely beyond our control — courier
          strikes, natural disasters, civil unrest, or government action. If such a delay is
          substantial we will tell you and you may cancel for a full refund.
        </p>
      </Section>

      <Section heading="Governing law">
        <p>
          These terms are governed by the laws of India, and the courts at {legal.jurisdiction} have
          exclusive jurisdiction over any dispute. Before going to court, please write to us — most
          things are settled faster that way.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          We may update these terms. The version that applies to your order is the one published
          when you placed it.
        </p>
      </Section>
    </LegalPage>
  );
}
