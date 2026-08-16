import { financialYearOf } from './financial-year';
import { amountInWords } from './amount-in-words';

describe('financialYearOf', () => {
  it('starts a new year on 1 April', () => {
    expect(financialYearOf(new Date('2026-03-31T18:30:00Z'))).toBe('2025-26');
    expect(financialYearOf(new Date('2026-04-01T00:00:00Z'))).toBe('2026-27');
  });

  it('keeps January to March in the year that began the previous April', () => {
    expect(financialYearOf(new Date('2027-01-15T00:00:00Z'))).toBe('2026-27');
    expect(financialYearOf(new Date('2027-03-31T00:00:00Z'))).toBe('2026-27');
  });

  it('rolls the century correctly', () => {
    expect(financialYearOf(new Date('2099-05-01T00:00:00Z'))).toBe('2099-00');
    expect(financialYearOf(new Date('2100-05-01T00:00:00Z'))).toBe('2100-01');
  });
});

describe('amountInWords', () => {
  it('writes whole rupees', () => {
    expect(amountInWords(0)).toBe('Zero Rupees Only');
    expect(amountInWords(1)).toBe('One Rupees Only');
    expect(amountInWords(999)).toBe('Nine Hundred Ninety Nine Rupees Only');
  });

  it('uses Indian units rather than millions', () => {
    expect(amountInWords(100000)).toBe('One Lakh Rupees Only');
    expect(amountInWords(2450000)).toBe('Twenty Four Lakh Fifty Thousand Rupees Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
  });

  it('includes paise when there are any', () => {
    expect(amountInWords('2450.68')).toBe(
      'Two Thousand Four Hundred Fifty Rupees and Sixty Eight Paise Only',
    );
    expect(amountInWords('0.50')).toBe('Fifty Paise Only');
  });

  it('handles a realistic order total', () => {
    expect(amountInWords('123456.78')).toBe(
      'One Lakh Twenty Three Thousand Four Hundred Fifty Six Rupees and Seventy Eight Paise Only',
    );
  });
});
