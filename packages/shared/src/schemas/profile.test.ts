import { describe, expect, it } from 'vitest';
import { ProfileSchema, emptyProfile } from './profile';

const valid = {
  handle: 'formal_fan',
  bio: 'Verifying FIFOs.',
  links: {
    linkedin: 'https://www.linkedin.com/in/someone',
    github: 'https://github.com/someone',
    website: 'https://example.com/me',
  },
};

describe('ProfileSchema', () => {
  it('accepts a full profile and an empty one', () => {
    expect(ProfileSchema.parse(valid)).toEqual(valid);
    expect(ProfileSchema.parse(emptyProfile())).toEqual(emptyProfile());
  });

  it('refuses bad handles', () => {
    for (const handle of ['ab', 'Has_Caps', 'with space', 'a'.repeat(31), 'admin']) {
      expect(ProfileSchema.safeParse({ ...valid, handle }).success, handle).toBe(false);
    }
  });

  it('takes only https links, and LinkedIn and GitHub links only from those sites', () => {
    const withLinks = (links: Partial<typeof valid.links>) =>
      ProfileSchema.safeParse({ ...valid, links: { ...valid.links, ...links } }).success;
    expect(withLinks({ website: 'http://example.com' })).toBe(false);
    expect(withLinks({ website: 'javascript:alert(1)' })).toBe(false);
    expect(withLinks({ linkedin: 'https://evil.example/in/someone' })).toBe(false);
    expect(withLinks({ github: 'https://gist.github.com/someone' })).toBe(false);
    expect(withLinks({ github: 'https://github.com/someone' })).toBe(true);
  });

  it('refuses unknown fields and an overlong bio', () => {
    expect(ProfileSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...valid, bio: 'x'.repeat(501) }).success).toBe(false);
  });
});
