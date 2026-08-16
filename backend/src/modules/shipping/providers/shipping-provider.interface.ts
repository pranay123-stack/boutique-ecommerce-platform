export interface ShippingAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface AddressValidationResult {
  valid: boolean;
  serviceable: boolean;
  reason?: string;
  normalised?: Partial<ShippingAddress>;
}

export interface RateQuoteInput {
  destinationPostalCode: string;
  weightGrams: number;
  declaredValue: number;
  cod: boolean;
}

export interface ShippingRate {
  courierId: string;
  courierName: string;
  charge: number;
  estimatedDays: number;
  cod: boolean;
}

export interface CreateShipmentInput {
  orderNumber: string;
  orderId: string;
  customerEmail: string;
  shippingAddress: ShippingAddress;
  items: Array<{ sku: string; name: string; quantity: number; unitPrice: number }>;
  subtotal: number;
  weightGrams: number;
  courierId?: string;
}

export interface ShipmentResult {
  providerShipmentId: string;
  providerOrderId: string | null;
  awbCode: string | null;
  courierName: string | null;
  labelUrl: string | null;
  manifestUrl: string | null;
  estimatedDelivery: Date | null;
  shippingCharge: number | null;
  raw: unknown;
}

export interface TrackingEvent {
  status: string;
  description: string | null;
  location: string | null;
  occurredAt: Date;
}

export interface TrackingResult {
  /** Normalised to our ShipmentStatus enum values. */
  status: string;
  courierName: string | null;
  estimatedDelivery: Date | null;
  deliveredAt: Date | null;
  events: TrackingEvent[];
  raw: unknown;
}

/**
 * Contract for every shipping carrier integration.
 *
 * The order and fulfilment code depends only on this interface, so swapping
 * Shiprocket for Delhivery or adding a second carrier is additive.
 */
export interface IShippingProvider {
  readonly name: string;
  validateAddress(address: ShippingAddress): Promise<AddressValidationResult>;
  getRates(input: RateQuoteInput): Promise<ShippingRate[]>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>;
  track(awbCode: string): Promise<TrackingResult>;
  cancelShipment(providerShipmentId: string): Promise<{ cancelled: boolean }>;
}

export const SHIPPING_PROVIDER = Symbol('SHIPPING_PROVIDER');
