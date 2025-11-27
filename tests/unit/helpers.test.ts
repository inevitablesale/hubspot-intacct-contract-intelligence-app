import {
  generateId,
  daysBetween,
  formatCurrency,
  parseDate,
  isWithinDays,
  calculatePercentage,
  clamp,
  chunk,
  deepClone,
} from '../../src/utils/helpers';

describe('Helper Utilities', () => {
  describe('generateId', () => {
    it('should generate a unique ID', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });

    it('should generate string ID', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  describe('daysBetween', () => {
    it('should calculate days between two dates', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-01-10');

      const days = daysBetween(date1, date2);

      expect(days).toBe(9);
    });

    it('should return negative days for past dates', () => {
      const date1 = new Date('2024-01-10');
      const date2 = new Date('2024-01-01');

      const days = daysBetween(date1, date2);

      expect(days).toBe(-9);
    });

    it('should return 0 for same date', () => {
      const date = new Date('2024-01-01');

      const days = daysBetween(date, date);

      expect(days).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('should format USD currency', () => {
      const formatted = formatCurrency(1234.56, 'USD');

      expect(formatted).toBe('$1,234.56');
    });

    it('should default to USD', () => {
      const formatted = formatCurrency(1000);

      expect(formatted).toBe('$1,000.00');
    });

    it('should handle zero', () => {
      const formatted = formatCurrency(0);

      expect(formatted).toBe('$0.00');
    });

    it('should handle large numbers', () => {
      const formatted = formatCurrency(1234567.89);

      expect(formatted).toBe('$1,234,567.89');
    });
  });

  describe('parseDate', () => {
    it('should parse valid date string', () => {
      const date = parseDate('2024-01-15');

      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2024);
      expect(date.getMonth()).toBe(0); // January
      expect(date.getDate()).toBe(15);
    });

    it('should return Date object as-is', () => {
      const inputDate = new Date('2024-01-15');
      const result = parseDate(inputDate);

      expect(result).toBe(inputDate);
    });

    it('should throw error for invalid date', () => {
      expect(() => parseDate('invalid-date')).toThrow('Invalid date');
    });
  });

  describe('isWithinDays', () => {
    it('should return true for date within range', () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

      expect(isWithinDays(futureDate, 30)).toBe(true);
    });

    it('should return false for date outside range', () => {
      const futureDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000); // 45 days from now

      expect(isWithinDays(futureDate, 30)).toBe(false);
    });

    it('should return false for past dates', () => {
      const pastDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago

      expect(isWithinDays(pastDate, 30)).toBe(false);
    });
  });

  describe('calculatePercentage', () => {
    it('should calculate correct percentage', () => {
      expect(calculatePercentage(25, 100)).toBe(25);
      expect(calculatePercentage(50, 200)).toBe(25);
      expect(calculatePercentage(75, 100)).toBe(75);
    });

    it('should return 0 when total is 0', () => {
      expect(calculatePercentage(50, 0)).toBe(0);
    });

    it('should round to whole number', () => {
      expect(calculatePercentage(1, 3)).toBe(33);
    });
  });

  describe('clamp', () => {
    it('should return value if within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it('should return min if value is below', () => {
      expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('should return max if value is above', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('should handle edge cases', () => {
      expect(clamp(0, 0, 100)).toBe(0);
      expect(clamp(100, 0, 100)).toBe(100);
    });
  });

  describe('chunk', () => {
    it('should split array into chunks', () => {
      const array = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const chunks = chunk(array, 3);

      expect(chunks.length).toBe(4);
      expect(chunks[0]).toEqual([1, 2, 3]);
      expect(chunks[1]).toEqual([4, 5, 6]);
      expect(chunks[2]).toEqual([7, 8, 9]);
      expect(chunks[3]).toEqual([10]);
    });

    it('should handle empty array', () => {
      const chunks = chunk([], 3);

      expect(chunks.length).toBe(0);
    });

    it('should handle array smaller than chunk size', () => {
      const chunks = chunk([1, 2], 5);

      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual([1, 2]);
    });
  });

  describe('deepClone', () => {
    it('should create a deep copy of object', () => {
      const original = {
        a: 1,
        b: {
          c: 2,
          d: [3, 4, 5],
        },
      };

      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
      expect(cloned.b.d).not.toBe(original.b.d);
    });

    it('should handle arrays', () => {
      const original = [1, [2, 3], { a: 4 }];

      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[1]).not.toBe(original[1]);
    });
  });
});
