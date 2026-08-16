import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../redis/cache.service';
import type {
  AddressValidationResult,
  CreateShipmentInput,
  IShippingProvider,
  RateQuoteInput,
  ShipmentResult,
  ShippingAddress,
  ShippingRate,
  TrackingResult,
} from './shipping-provider.interface';

/**
 * Shiprocket adapter.
 *
 * Shiprocket issues a bearer token that is valid for 10 days; we cache it in
 * Redis and refresh on 401 rather than logging in on every call.
 */
@Injectable()
export class ShiprocketProvider implements IShippingProvider {
  readonly name = 'SHIPROCKET';
  private readonly logger = new Logger(ShiprocketProvider.name);
  private readonly apiBase: string;
  private readonly email: string;
  private readonly password: string;
  private readonly pickupPostcode: string;
  private static readonly TOKEN_CACHE_KEY = 'shiprocket:token';

  constructor(
    config: ConfigService,
    private readonly cache: CacheService,
  ) {
    this.apiBase = config.get<string>('shipping.shiprocket.apiBase') as string;
    this.email = config.get<string>('shipping.shiprocket.email') as string;
    this.password = config.get<string>('shipping.shiprocket.password') as string;
    this.pickupPostcode = config.get<string>('shipping.shiprocket.pickupPostcode') as string;
  }

  private async getToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const cached = await this.cache.get<string>(ShiprocketProvider.TOKEN_CACHE_KEY);
      if (cached) return cached;
    }
    const response = await fetch(`${this.apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Shipping provider authentication failed');
    }
    const body = (await response.json()) as { token: string };
    // Refresh a day early to avoid using a token that expires mid-request.
    await this.cache.set(ShiprocketProvider.TOKEN_CACHE_KEY, body.token, 9 * 24 * 3600);
    return body.token;
  }

  private async request<T>(path: string, init: RequestInit = {}, retryOn401 = true): Promise<T> {
    const token = await this.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${this.apiBase}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      if (response.status === 401 && retryOn401) {
        await this.getToken(true);
        return this.request<T>(path, init, false);
      }
      const body = (await response.json().catch(() => ({}))) as any;
      if (!response.ok) {
        this.logger.error(
          `Shiprocket ${path} failed (${response.status}): ${JSON.stringify(body).slice(0, 300)}`,
        );
        throw new ServiceUnavailableException(body?.message ?? 'Shipping provider error');
      }
      return body as T;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new ServiceUnavailableException('Shipping provider timed out');
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async validateAddress(address: ShippingAddress): Promise<AddressValidationResult> {
    if (!/^\d{6}$/.test(address.postalCode)) {
      return { valid: false, serviceable: false, reason: 'Indian PIN codes must be 6 digits' };
    }
    try {
      const body = await this.request<any>(
        `/courier/serviceability/?pickup_postcode=${this.pickupPostcode}` +
          `&delivery_postcode=${address.postalCode}&cod=0&weight=0.5`,
      );
      const available = body?.data?.available_courier_companies ?? [];
      return {
        valid: true,
        serviceable: available.length > 0,
        reason: available.length ? undefined : 'No courier services this PIN code',
      };
    } catch {
      // A provider outage must not block checkout; treat as serviceable and
      // let the fulfilment step surface any real problem.
      return { valid: true, serviceable: true, reason: 'Serviceability check unavailable' };
    }
  }

  async getRates(input: RateQuoteInput): Promise<ShippingRate[]> {
    const body = await this.request<any>(
      `/courier/serviceability/?pickup_postcode=${this.pickupPostcode}` +
        `&delivery_postcode=${input.destinationPostalCode}` +
        `&cod=${input.cod ? 1 : 0}&weight=${(input.weightGrams / 1000).toFixed(2)}` +
        `&declared_value=${input.declaredValue}`,
    );
    const couriers = body?.data?.available_courier_companies ?? [];
    return couriers.map((c: any) => ({
      courierId: String(c.courier_company_id),
      courierName: c.courier_name,
      charge: Number(c.rate ?? 0),
      estimatedDays: Number(c.estimated_delivery_days ?? 5),
      cod: Boolean(c.cod),
    }));
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const body = await this.request<any>('/orders/create/adhoc', {
      method: 'POST',
      body: JSON.stringify({
        order_id: input.orderNumber,
        order_date: new Date().toISOString().slice(0, 10),
        pickup_location: 'Primary',
        billing_customer_name: input.shippingAddress.fullName,
        billing_address: input.shippingAddress.line1,
        billing_address_2: input.shippingAddress.line2 ?? '',
        billing_city: input.shippingAddress.city,
        billing_pincode: input.shippingAddress.postalCode,
        billing_state: input.shippingAddress.state,
        billing_country:
          input.shippingAddress.country === 'IN' ? 'India' : input.shippingAddress.country,
        billing_email: input.customerEmail,
        billing_phone: input.shippingAddress.phone.replace(/\D/g, '').slice(-10),
        shipping_is_billing: true,
        order_items: input.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          units: i.quantity,
          selling_price: i.unitPrice,
        })),
        payment_method: 'Prepaid',
        sub_total: input.subtotal,
        length: 15,
        breadth: 12,
        height: 5,
        weight: Math.max(0.1, input.weightGrams / 1000),
      }),
    });

    return {
      providerShipmentId: String(body.shipment_id ?? ''),
      providerOrderId: String(body.order_id ?? ''),
      awbCode: body.awb_code ?? null,
      courierName: body.courier_name ?? null,
      labelUrl: body.label_url ?? null,
      manifestUrl: body.manifest_url ?? null,
      estimatedDelivery: null,
      shippingCharge: body.freight_charges ? Number(body.freight_charges) : null,
      raw: body,
    };
  }

  async track(awbCode: string): Promise<TrackingResult> {
    const body = await this.request<any>(`/courier/track/awb/${awbCode}`);
    const data = body?.tracking_data ?? {};
    const activities = data?.shipment_track_activities ?? [];

    return {
      status: this.normaliseStatus(data?.shipment_track?.[0]?.current_status ?? ''),
      courierName: data?.shipment_track?.[0]?.courier_name ?? null,
      estimatedDelivery: data?.etd ? new Date(data.etd) : null,
      deliveredAt: data?.shipment_track?.[0]?.delivered_date
        ? new Date(data.shipment_track[0].delivered_date)
        : null,
      events: activities.map((a: any) => ({
        status: a.status ?? 'UPDATE',
        description: a.activity ?? null,
        location: a.location ?? null,
        occurredAt: a.date ? new Date(a.date) : new Date(),
      })),
      raw: body,
    };
  }

  async cancelShipment(providerShipmentId: string): Promise<{ cancelled: boolean }> {
    await this.request('/orders/cancel', {
      method: 'POST',
      body: JSON.stringify({ ids: [Number(providerShipmentId)] }),
    });
    return { cancelled: true };
  }

  /** Map carrier vocabulary onto our ShipmentStatus enum. */
  private normaliseStatus(raw: string): string {
    const s = raw.toUpperCase();
    if (s.includes('DELIVERED')) return 'DELIVERED';
    if (s.includes('OUT FOR DELIVERY')) return 'OUT_FOR_DELIVERY';
    if (s.includes('RTO') || s.includes('RETURN')) return 'RETURNED';
    if (s.includes('CANCEL')) return 'CANCELLED';
    if (s.includes('PICKUP') || s.includes('PICKED')) return 'PICKUP_SCHEDULED';
    if (s.includes('TRANSIT') || s.includes('SHIPPED')) return 'IN_TRANSIT';
    if (s.includes('UNDELIVERED') || s.includes('FAILED')) return 'FAILED_DELIVERY';
    return 'CREATED';
  }
}
