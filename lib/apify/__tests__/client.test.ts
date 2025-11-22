import { validateLinkedInUrl, normalizeLinkedInUrl } from '../processors';

describe('ApifyClient', () => {
  describe('LinkedIn URL Validation', () => {
    it('should validate correct LinkedIn profile URLs', () => {
      expect(validateLinkedInUrl('https://www.linkedin.com/in/johndoe')).toBe(true);
      expect(validateLinkedInUrl('https://linkedin.com/in/jane-smith')).toBe(true);
      expect(validateLinkedInUrl('http://www.linkedin.com/in/test-user123')).toBe(true);
    });

    it('should reject invalid LinkedIn URLs', () => {
      expect(validateLinkedInUrl('https://twitter.com/johndoe')).toBe(false);
      expect(validateLinkedInUrl('linkedin.com/in/johndoe')).toBe(false);
      expect(validateLinkedInUrl('https://linkedin.com/profile/johndoe')).toBe(false);
    });
  });

  describe('LinkedIn URL Normalization', () => {
    it('should normalize LinkedIn URLs correctly', () => {
      expect(normalizeLinkedInUrl('linkedin.com/in/johndoe/')).toBe(
        'https://linkedin.com/in/johndoe'
      );
      expect(normalizeLinkedInUrl('https://www.linkedin.com/in/johndoe?trk=123')).toBe(
        'https://www.linkedin.com/in/johndoe'
      );
      expect(normalizeLinkedInUrl('http://linkedin.com/in/johndoe#profile')).toBe(
        'https://linkedin.com/in/johndoe'
      );
    });
  });
});
