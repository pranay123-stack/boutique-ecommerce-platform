/**
 * Transactional message templates.
 *
 * Kept as plain functions returning subject/text/html so they are trivially
 * unit-testable and have no runtime template-engine dependency. The HTML is
 * deliberately table-free and inline-styled - that is what survives Gmail,
 * Outlook and Apple Mail without a rendering service.
 */

export interface TemplateOutput {
  subject: string;
  text: string;
  html: string;
}

const BRAND = 'Boutique';
const ACCENT = '#8b5a3c';

const shell = (heading: string, body: string, cta?: { label: string; url: string }): string => `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#faf8f5;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #ece5dc;">
    <div style="background:${ACCENT};padding:24px 32px;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;letter-spacing:0.5px;">${BRAND}</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#2d2a26;">${heading}</h2>
      <div style="font-size:14px;line-height:1.6;color:#55504a;">${body}</div>
      ${
        cta
          ? `<div style="margin-top:28px;"><a href="${cta.url}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;">${cta.label}</a></div>`
          : ''
      }
    </div>
    <div style="padding:20px 32px;background:#faf8f5;font-size:12px;color:#8a8279;">
      You are receiving this because you have an account or placed an order with ${BRAND}.
    </div>
  </div>
</div>`;

const money = (v: string | number) => `₹${Number(v).toFixed(2)}`;

export const templates = {
  'user.welcome': (p: { firstName: string; verificationUrl?: string }): TemplateOutput => ({
    subject: `Welcome to ${BRAND}`,
    text: `Hi ${p.firstName}, welcome to ${BRAND}.${p.verificationUrl ? ` Confirm your email: ${p.verificationUrl}` : ''}`,
    html: shell(
      `Welcome, ${p.firstName}`,
      `<p>Thanks for creating an account. Your wishlist, saved addresses and order history are ready when you are.</p>${
        p.verificationUrl ? '<p>Please confirm your email address to secure your account.</p>' : ''
      }`,
      p.verificationUrl ? { label: 'Confirm email', url: p.verificationUrl } : undefined,
    ),
  }),

  'user.password_reset': (p: { firstName: string; resetUrl: string }): TemplateOutput => ({
    subject: `Reset your ${BRAND} password`,
    text: `Hi ${p.firstName}, reset your password here: ${p.resetUrl} (valid for 1 hour)`,
    html: shell(
      'Reset your password',
      `<p>Hi ${p.firstName}, we received a request to reset your password. This link is valid for one hour.</p>
       <p style="color:#8a8279;">If you did not request this, you can safely ignore this email - your password will not change.</p>`,
      { label: 'Reset password', url: p.resetUrl },
    ),
  }),

  'order.confirmation': (p: {
    orderNumber: string;
    grandTotal: string;
    orderUrl: string;
  }): TemplateOutput => ({
    subject: `Order ${p.orderNumber} received`,
    text: `We've received order ${p.orderNumber} for ${money(p.grandTotal)}. Track it at ${p.orderUrl}`,
    html: shell(
      'Thank you for your order',
      `<p>We've received order <strong>${p.orderNumber}</strong>.</p>
       <p>Order total: <strong>${money(p.grandTotal)}</strong></p>
       <p>We'll email you again as soon as it ships.</p>`,
      { label: 'View order', url: p.orderUrl },
    ),
  }),

  'payment.success': (p: {
    orderNumber: string;
    grandTotal: string;
    orderUrl: string;
  }): TemplateOutput => ({
    subject: `Payment confirmed for ${p.orderNumber}`,
    text: `Payment of ${money(p.grandTotal)} confirmed for order ${p.orderNumber}.`,
    html: shell(
      'Payment confirmed',
      `<p>We've received your payment of <strong>${money(p.grandTotal)}</strong> for order <strong>${p.orderNumber}</strong>.</p>
       <p>Your order is now being prepared.</p>`,
      { label: 'View order', url: p.orderUrl },
    ),
  }),

  'payment.failed': (p: {
    orderNumber: string;
    reason: string;
    retryUrl: string;
  }): TemplateOutput => ({
    subject: `Payment could not be completed for ${p.orderNumber}`,
    text: `Payment for order ${p.orderNumber} failed: ${p.reason}. Retry at ${p.retryUrl}`,
    html: shell(
      'Payment unsuccessful',
      `<p>We couldn't process payment for order <strong>${p.orderNumber}</strong>.</p>
       <p style="color:#8a8279;">Reason: ${p.reason}</p>
       <p>Your items are still reserved for a short while - you can try again below.</p>`,
      { label: 'Retry payment', url: p.retryUrl },
    ),
  }),

  'order.processing': (p: { orderNumber: string; orderUrl: string }): TemplateOutput => ({
    subject: `Order ${p.orderNumber} is being prepared`,
    text: `Order ${p.orderNumber} is now being prepared.`,
    html: shell(
      'Your order is being prepared',
      `<p>Order <strong>${p.orderNumber}</strong> is being picked and packed by our team.</p>`,
      { label: 'View order', url: p.orderUrl },
    ),
  }),

  'shipment.created': (p: {
    orderNumber: string;
    courierName: string;
    awbCode: string;
    trackingUrl: string;
  }): TemplateOutput => ({
    subject: `Order ${p.orderNumber} has shipped`,
    text: `Order ${p.orderNumber} shipped via ${p.courierName}. Tracking: ${p.awbCode} - ${p.trackingUrl}`,
    html: shell(
      'Your order is on its way',
      `<p>Order <strong>${p.orderNumber}</strong> has been handed to <strong>${p.courierName}</strong>.</p>
       <p>Tracking number: <strong>${p.awbCode}</strong></p>`,
      { label: 'Track shipment', url: p.trackingUrl },
    ),
  }),

  'shipment.delivered': (p: { orderNumber: string; reviewUrl: string }): TemplateOutput => ({
    subject: `Order ${p.orderNumber} delivered`,
    text: `Order ${p.orderNumber} has been delivered. Tell us what you think: ${p.reviewUrl}`,
    html: shell(
      'Delivered',
      `<p>Order <strong>${p.orderNumber}</strong> has been delivered. We hope you love it.</p>
       <p>A short review helps other customers enormously.</p>`,
      { label: 'Write a review', url: p.reviewUrl },
    ),
  }),

  'refund.processed': (p: { orderNumber: string; amount: string }): TemplateOutput => ({
    subject: `Refund issued for ${p.orderNumber}`,
    text: `A refund of ${money(p.amount)} has been issued for order ${p.orderNumber}.`,
    html: shell(
      'Refund issued',
      `<p>We've issued a refund of <strong>${money(p.amount)}</strong> for order <strong>${p.orderNumber}</strong>.</p>
       <p style="color:#8a8279;">Funds typically reach your account within 5-7 working days, depending on your bank.</p>`,
    ),
  }),

  'order.cancelled': (p: { orderNumber: string; reason: string }): TemplateOutput => ({
    subject: `Order ${p.orderNumber} cancelled`,
    text: `Order ${p.orderNumber} has been cancelled. ${p.reason}`,
    html: shell(
      'Order cancelled',
      `<p>Order <strong>${p.orderNumber}</strong> has been cancelled.</p>
       <p style="color:#8a8279;">${p.reason}</p>
       <p>Any payment taken will be refunded automatically.</p>`,
    ),
  }),

  'support.contact_received': (p: {
    name: string;
    email: string;
    phone: string;
    orderNumber: string;
    subject: string;
    message: string;
  }): TemplateOutput => ({
    // Goes to the team, not the customer, so it reads as a work item.
    subject: `Contact form: ${p.subject}`,
    text: `${p.name} <${p.email}> got in touch.\nPhone: ${p.phone}\nOrder: ${p.orderNumber}\n\n${p.message}`,
    html: shell(
      `New message from ${p.name}`,
      `<p style="margin:0 0 12px;"><strong>${p.subject}</strong></p>
       <p style="margin:0 0 12px;white-space:pre-wrap;">${p.message}</p>
       <p style="margin:0;color:#8a8279;font-size:13px;">
         ${p.email}${p.phone !== '-' ? ` &middot; ${p.phone}` : ''}${p.orderNumber !== '-' ? ` &middot; order ${p.orderNumber}` : ''}
       </p>`,
    ),
  }),

  'inventory.low_stock': (p: {
    sku: string;
    quantity: number;
    threshold: number;
  }): TemplateOutput => ({
    subject: `Low stock: ${p.sku}`,
    text: `SKU ${p.sku} is down to ${p.quantity} units (threshold ${p.threshold}).`,
    html: shell(
      'Low stock alert',
      `<p>SKU <strong>${p.sku}</strong> has fallen to <strong>${p.quantity}</strong> units, at or below its reorder threshold of ${p.threshold}.</p>`,
    ),
  }),
} as const;

export type TemplateName = keyof typeof templates;

export function renderTemplate(name: TemplateName, payload: Record<string, any>): TemplateOutput {
  const fn = templates[name] as (p: any) => TemplateOutput;
  if (!fn) throw new Error(`Unknown notification template: ${name}`);
  return fn(payload);
}
