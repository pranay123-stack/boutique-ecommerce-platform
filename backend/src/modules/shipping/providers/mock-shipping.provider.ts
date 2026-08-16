import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
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
 * Offline carrier used for development, CI and E2E.
 *
 * Applies the same PIN-code validation and rate rules as the live path so the
 * behaviour under test matches production; only the network call is replaced.
 */
@Injectable()
export class MockShippingProvider implements IShippingProvider {
  readonly name = 'MOCK';
  private readonly logger = new Logger(MockShippingProvider.name);
  private readonly freeThreshold: number;
  private readonly flatRate: number;

  constructor(config: ConfigService) {
    this.freeThreshold = config.get<number>('shipping.freeThreshold') ?? 1999;
    this.flatRate = config.get<number>('shipping.flatRate') ?? 99;
    this.logger.warn('Shipping running in MOCK mode - no real shipments will be booked');
  }

  async validateAddress(address: ShippingAddress): Promise<AddressValidationResult> {
    if (address.country === 'IN' && !/^\d{6}$/.test(address.postalCode)) {
      return { valid: false, serviceable: false, reason: 'Indian PIN codes must be 6 digits' };
    }
    if (!address.line1?.trim() || !address.city?.trim() || !address.state?.trim()) {
      return { valid: false, serviceable: false, reason: 'Address is incomplete' };
    }
    const digits = address.phone.replace(/\D/g, '');
    if (digits.length < 10) {
      return { valid: false, serviceable: false, reason: 'A valid phone number is required' };
    }
    // Reserved test PIN used by the E2E suite to exercise the unserviceable path.
    if (address.postalCode === '000000') {
      return { valid: true, serviceable: false, reason: 'No courier services this PIN code' };
    }
    return {
      valid: true,
      serviceable: true,
      normalised: { ...address, country: address.country || 'IN' },
    };
  }

  async getRates(input: RateQuoteInput): Promise<ShippingRate[]> {
    const free = input.declaredValue >= this.freeThreshold;
    const heavySurcharge = Math.max(0, Math.ceil(input.weightGrams / 1000) - 1) * 20;
    return [
      {
        courierId: 'mock-standard',
        courierName: 'Boutique Standard',
        charge: free ? 0 : this.flatRate + heavySurcharge,
        estimatedDays: 5,
        cod: input.cod,
      },
      {
        courierId: 'mock-express',
        courierName: 'Boutique Express',
        charge: (free ? 0 : this.flatRate) + 149 + heavySurcharge,
        estimatedDays: 2,
        cod: input.cod,
      },
    ];
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const id = randomBytes(6).toString('hex').toUpperCase();
    return {
      providerShipmentId: `MOCKSHIP${id}`,
      providerOrderId: input.orderNumber,
      awbCode: `MOCKAWB${id}`,
      courierName: input.courierId === 'mock-express' ? 'Boutique Express' : 'Boutique Standard',
      labelUrl: `https://example.invalid/labels/${id}.pdf`,
      manifestUrl: null,
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      shippingCharge: null,
      raw: { mock: true, orderNumber: input.orderNumber },
    };
  }

  async track(awbCode: string): Promise<TrackingResult> {
    const now = Date.now();
    return {
      status: 'IN_TRANSIT',
      courierName: 'Boutique Standard',
      estimatedDelivery: new Date(now + 3 * 24 * 3600 * 1000),
      deliveredAt: null,
      events: [
        {
          status: 'CREATED',
          description: 'Shipment booked',
          location: 'Bengaluru',
          occurredAt: new Date(now - 2 * 24 * 3600 * 1000),
        },
        {
          status: 'IN_TRANSIT',
          description: 'In transit to destination hub',
          location: 'Bengaluru Hub',
          occurredAt: new Date(now - 24 * 3600 * 1000),
        },
      ],
      raw: { mock: true, awbCode },
    };
  }

  async cancelShipment(): Promise<{ cancelled: boolean }> {
    return { cancelled: true };
  }
}
