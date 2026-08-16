import type { Metadata } from 'next';
import { LegalPage, Section, Detail } from '@/components/legal/legal-page';
import { legal } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What personal data we collect, why we collect it, and the choices you have.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What we collect, why we collect it, how long we keep it, and what you can ask us to do with it."
    >
      <Section heading="Who we are">
        <p>
          <Detail value={legal.legalName} placeholder="registered business name" />, trading as{' '}
          {legal.siteName}, at{' '}
          <Detail value={legal.address} placeholder="registered address" />, is the data fiduciary
          for the personal data described here. We can be reached at{' '}
          <Detail value={legal.supportEmail} placeholder="support email" />.
        </p>
      </Section>

      <Section heading="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account details</strong> — your name, email address and phone number, so we can
            identify you and contact you about your orders.
          </li>
          <li>
            <strong>Order and delivery details</strong> — the addresses you give us, what you
            bought, and the status of each shipment.
          </li>
          <li>
            <strong>Payment details</strong> — handled entirely by our payment gateway. We receive
            a transaction reference, the amount, and whether it succeeded. We never see or store
            your full card number, CVV or UPI PIN.
          </li>
          <li>
            <strong>Technical data</strong> — IP address, browser and device type, and the pages you
            visit, used to keep the site secure, prevent fraud, and understand what is and is not
            working.
          </li>
          <li>
            <strong>Communications</strong> — anything you send us by email, WhatsApp or the contact
            form, kept so we can follow up properly.
          </li>
        </ul>
      </Section>

      <Section heading="Why we use it">
        <p>
          To take payment, fulfil and deliver your order, handle returns and refunds, answer your
          questions, meet our tax and accounting obligations, detect and prevent fraud, and — only
          if you have opted in — send you marketing.
        </p>
        <p>
          We do not sell your personal data. We do not use it to build profiles that are sold or
          shared for advertising.
        </p>
      </Section>

      <Section heading="Who we share it with">
        <p>
          Only the processors we need to run the store, and only the minimum each one needs: our
          payment gateway, our courier and logistics partner, our email, SMS and WhatsApp providers,
          our hosting and error-monitoring providers, and our accountants and auditors. Each is
          bound to use your data only on our instructions.
        </p>
        <p>
          We will also disclose data where the law requires it — a court order, a tax demand, or a
          lawful request from a government agency.
        </p>
      </Section>

      <Section heading="How long we keep it">
        <p>
          Order, invoice and tax records are kept for eight years, because Indian tax law requires
          it. Account details are kept while your account is open and for one year after you close
          it. Marketing consent records are kept until you withdraw consent, plus three years so we
          can show when and how you asked to stop. Server and access logs are kept for 90 days.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can ask us to show you the personal data we hold about you, correct anything wrong,
          delete your account and the data we are not legally required to keep, or stop sending you
          marketing. Every marketing email carries an unsubscribe link that works without you having
          to write to anyone.
        </p>
        <p>
          Write to <Detail value={legal.supportEmail} placeholder="support email" /> and we will
          respond within 30 days. We may ask you to confirm your identity first, so that nobody else
          can make these requests in your name.
        </p>
      </Section>

      <Section heading="Cookies">
        <p>
          We set a session cookie so your cart survives a page reload, and a secure authentication
          cookie once you sign in. Both are necessary for the site to work. Any analytics or
          advertising cookies are set only after you agree to them, and you can change your mind at
          any time.
        </p>
      </Section>

      <Section heading="Security">
        <p>
          Traffic is encrypted in transit. Passwords are stored using a slow, salted hash and are
          never recoverable in plain text — not even by us. Access to customer data is restricted to
          staff who need it, and every administrative action is logged. No system is perfectly
          secure, but if a breach ever affects your data we will tell you and the relevant authority
          promptly.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          The store is not intended for anyone under 18. We do not knowingly collect data from
          children; if you believe a child has given us personal data, contact us and we will delete
          it.
        </p>
      </Section>

      <Section heading="Grievance officer">
        <p>
          As required by the Information Technology Act, 2000 and the rules under it, our grievance
          officer is <Detail value={legal.grievanceOfficer} placeholder="grievance officer name" />,
          reachable at{' '}
          <Detail
            value={legal.grievanceEmail || legal.supportEmail}
            placeholder="grievance officer email"
          />
          . Complaints are acknowledged within 24 hours and resolved within 15 days.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change this policy we will update the date at the top of this page, and tell you by
          email if the change materially affects you.
        </p>
      </Section>
    </LegalPage>
  );
}
