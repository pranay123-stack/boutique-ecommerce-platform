import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section } from '@/components/legal/legal-page';
import { legal } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Returns & Refunds',
  description: 'How to return or exchange an item, and when you get your money back.',
};

export default function ReturnsPage() {
  return (
    <LegalPage
      title="Returns & Refunds"
      summary={`Changed your mind, or something arrived wrong? You have ${legal.returnWindowDays} days.`}
    >
      <Section heading="The short version">
        <p>
          Tell us within <strong>{legal.returnWindowDays} days of delivery</strong>, send the item
          back unworn and with its tags on, and we refund you to your original payment method within{' '}
          {legal.refundBusinessDays} business days of it reaching us. If the fault is ours, we pay
          the return shipping too.
        </p>
      </Section>

      <Section heading="How to start a return">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Open the order in{' '}
            <Link href="/account/orders" className="underline underline-offset-4">
              your account
            </Link>{' '}
            and choose <strong>Request a return</strong>.
          </li>
          <li>Pick the items, tell us why, and submit. You will get a confirmation by email.</li>
          <li>
            We arrange a reverse pickup where our courier services your pincode — usually within two
            business days. Where they do not, we will send you a prepaid shipping label instead.
          </li>
          <li>
            Pack the item in its original packaging with the invoice, and hand it to the courier.
          </li>
          <li>
            We inspect it within two business days of arrival and refund you once it passes. You are
            emailed at every step.
          </li>
        </ol>
        <p className="text-sm">
          Ordered as a guest? Use{' '}
          <Link href="/track-order" className="underline underline-offset-4">
            order tracking
          </Link>{' '}
          to find your order, then request the return from there.
        </p>
      </Section>

      <Section heading="What we can accept">
        <p>Items come back to us unworn, unwashed and unaltered, with tags and original packaging intact.</p>
        <p>We cannot accept:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Items that have been worn, washed, altered or damaged after delivery</li>
          <li>Pierced jewellery, innerwear and swimwear, for hygiene reasons</li>
          <li>Made-to-measure or personalised pieces, unless they arrived faulty</li>
          <li>Anything bought as a final-sale or clearance item, which is marked as such at checkout</li>
          <li>Gift cards</li>
        </ul>
        <p>
          If a return does not pass inspection, we will tell you why, send photographs, and ship it
          back to you at no charge. We will not simply keep it.
        </p>
      </Section>

      <Section heading="Faulty, damaged or wrong items">
        <p>
          Tell us within 48 hours of delivery, with photographs. We will collect it at our cost and
          either replace it or refund you in full, including what you paid for delivery — whichever
          you prefer. This is on top of your rights under the Consumer Protection Act, 2019.
        </p>
      </Section>

      <Section heading="Exchanges">
        <p>
          Want a different size or colour? Ask for an exchange within {legal.exchangeWindowDays} days
          and we will ship the replacement as soon as the original reaches us, subject to stock. If
          the piece you wanted has sold out, we refund instead.
        </p>
      </Section>

      <Section heading="How refunds are paid">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Card, UPI, net banking or wallet</strong> — back to the same account, within{' '}
            {legal.refundBusinessDays} business days of us approving the return. Your bank may take
            a few days more to show it.
          </li>
          <li>
            <strong>Cash on delivery</strong> — by bank transfer. We will ask for your account
            details and IFSC when the return is approved. We never ask for them by phone, and we
            never ask for an OTP, a PIN or your card number.
          </li>
        </ul>
        <p>
          Delivery charges are refunded when the return is our fault. When you simply changed your
          mind, we refund the price of the goods and keep the delivery charge. Cash-on-delivery
          handling charges are not refundable.
        </p>
        <p>
          A credit note is issued against your original tax invoice, so the GST is reversed with the
          refund.
        </p>
      </Section>

      <Section heading="Cancelling before dispatch">
        <p>
          You can cancel free of charge any time before dispatch, from your account or by writing to
          us. Prepaid orders are refunded in full within {legal.refundBusinessDays} business days.
          Once a parcel has left us, treat it as a return.
        </p>
      </Section>
    </LegalPage>
  );
}
