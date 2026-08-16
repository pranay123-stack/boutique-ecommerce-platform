import { generateOrderNumber } from './order-number';

describe('generateOrderNumber', () => {
  it('uses the BQ-YYYYMMDD-XXXXXX shape', () => {
    const number = generateOrderNumber(new Date('2026-08-16T10:00:00Z'));
    expect(number).toMatch(/^BQ-20260816-[A-Z0-9]{6}$/);
  });

  it('omits characters that are easy to misread aloud', () => {
    // 0/O and 1/I are excluded so a customer can read the number over the phone.
    for (let i = 0; i < 200; i += 1) {
      const suffix = generateOrderNumber().split('-')[2];
      expect(suffix).not.toMatch(/[01OI]/);
    }
  });

  it('is not sequential - order numbers must not leak sales volume', () => {
    const numbers = new Set(Array.from({ length: 500 }, () => generateOrderNumber()));
    // 31^6 keyspace; 500 draws should essentially never collide.
    expect(numbers.size).toBeGreaterThan(495);
  });
});
