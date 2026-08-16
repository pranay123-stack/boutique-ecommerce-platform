import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, Section } from '@/components/legal/legal-page';
import { legal } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Shipping & Delivery',
  description: 'Delivery charges, timelines and how to track your order.',
};

const rows: Array<[string, string, string]> = [
  ['Metro cities', '2–4 business days', 'Bengaluru, Mumbai, Delhi NCR, Hyderabad, Chennai, Pune, Kolkata'],
  ['Other cities and towns', '4–7 business days', 'Anywhere our courier partners service'],
  ['Remote and hill areas', '7–10 business days', 'North East, Andaman & Nicobar, Ladakh, remote pincodes'],
];

export default function ShippingPage() {
  return (
    <LegalPage
      title="Shipping & Delivery"
      summary="What delivery costs, how long it takes, and what happens if something goes wrong on the way."
    >
      <Section heading="Charges">
        <p>
          Delivery is <strong>free on orders over ₹{legal.freeShippingThreshold.toLocaleString('en-IN')}</strong>. Below
          that, a flat ₹{legal.flatShippingRate} applies anywhere in India. Cash on delivery adds a ₹
          {legal.codCharge} handling charge. Every charge is shown at checkout before you confirm,
          and all of them include GST.
        </p>
      </Section>

      <Section heading="Dispatch">
        <p>
          Orders placed before 2pm on a business day are usually picked the same day; everything
          else moves the next. We aim to dispatch within {legal.dispatchBusinessDays} business days.
          You will get an email and SMS with the courier name and tracking number the moment your
          parcel leaves us.
        </p>
        <p>
          We do not dispatch on Sundays or public holidays, and sale periods can add a day or two.
          If anything is going to take materially longer, we will tell you rather than let you
          wonder.
        </p>
      </Section>

      <Section heading="Delivery timelines">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-4 font-medium text-foreground">Destination</th>
                <th className="py-2 pr-4 font-medium text-foreground">After dispatch</th>
                <th className="py-2 font-medium text-foreground">Covers</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([where, when, covers]) => (
                <tr key={where} className="border-b last:border-0">
                  <td className="py-3 pr-4 align-top text-foreground">{where}</td>
                  <td className="py-3 pr-4 align-top">{when}</td>
                  <td className="py-3 align-top">{covers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm">
          These are working estimates, not guarantees. Weather, strikes and local restrictions
          occasionally get in the way.
        </p>
      </Section>

      <Section heading="Tracking">
        <p>
          Sign in and open the order from your account, or use{' '}
          <Link href="/track-order" className="underline underline-offset-4">
            order tracking
          </Link>{' '}
          with your order number and the email you checked out with — no account needed.
        </p>
      </Section>

      <Section heading="Cash on delivery">
        <p>
          Available on most pincodes for orders up to ₹20,000. Please keep the exact amount ready;
          couriers rarely carry change. If the courier cannot reach you, they will attempt delivery
          up to three times before returning the parcel to us.
        </p>
      </Section>

      <Section heading="If something goes wrong">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Parcel looks tampered with.</strong> Refuse the delivery and tell us the same
            day. We will send a replacement or refund you in full.
          </li>
          <li>
            <strong>Tracking has not moved in 48 hours.</strong> Write to us and we will chase the
            courier and keep you posted.
          </li>
          <li>
            <strong>Marked delivered but not received.</strong> Tell us within 48 hours. We will
            raise a formal dispute with the courier and resolve it with you within seven business
            days.
          </li>
          <li>
            <strong>Wrong or incomplete address.</strong> Contact us before dispatch and we will
            correct it. After dispatch the courier may return the parcel, and a re-delivery charge
            can apply.
          </li>
        </ul>
      </Section>

      <Section heading="International orders">
        <p>
          We currently ship within India only. If you would like an order sent abroad, write to us
          and we will quote for it case by case. Any import duties are the recipient&apos;s
          responsibility.
        </p>
      </Section>
    </LegalPage>
  );
}
