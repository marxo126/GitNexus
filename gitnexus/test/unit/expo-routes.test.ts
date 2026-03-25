import { describe, it, expect } from 'vitest';
import { expoFileToRouteURL } from '../../src/core/ingestion/route-extractors/expo.js';

describe('expoFileToRouteURL', () => {
  it('converts root index to /', () => {
    expect(expoFileToRouteURL('app/index.tsx')).toBe('/');
  });

  it('converts screen file to route', () => {
    expect(expoFileToRouteURL('app/settings.tsx')).toBe('/settings');
  });

  it('strips route groups from URL', () => {
    expect(expoFileToRouteURL('app/(tabs)/index.tsx')).toBe('/');
    expect(expoFileToRouteURL('app/(tabs)/settings.tsx')).toBe('/settings');
    expect(expoFileToRouteURL('app/(auth)/login.tsx')).toBe('/login');
    expect(expoFileToRouteURL('app/(auth)/register.tsx')).toBe('/register');
  });

  it('handles nested route groups', () => {
    expect(expoFileToRouteURL('app/(tabs)/(home)/feed.tsx')).toBe('/feed');
  });

  it('handles deep paths within groups', () => {
    expect(expoFileToRouteURL('app/(customer)/booking-detail.tsx')).toBe('/booking-detail');
    expect(expoFileToRouteURL('app/(interpreter)/chat-detail.tsx')).toBe('/chat-detail');
  });

  it('handles index files in groups', () => {
    expect(expoFileToRouteURL('app/(admin)/index.tsx')).toBe('/');
    expect(expoFileToRouteURL('app/(customer)/index.tsx')).toBe('/');
  });

  it('skips _layout files', () => {
    expect(expoFileToRouteURL('app/_layout.tsx')).toBeNull();
    expect(expoFileToRouteURL('app/(tabs)/_layout.tsx')).toBeNull();
    expect(expoFileToRouteURL('app/(auth)/_layout.tsx')).toBeNull();
  });

  it('skips +not-found and other special files', () => {
    expect(expoFileToRouteURL('app/+not-found.tsx')).toBeNull();
    expect(expoFileToRouteURL('app/+html.tsx')).toBeNull();
  });

  it('handles Expo API routes (api+/)', () => {
    expect(expoFileToRouteURL('app/api+/health.ts')).toBe('/api/health');
    expect(expoFileToRouteURL('app/api+/users/index.ts')).toBe('/api/users');
  });

  it('handles various extensions', () => {
    expect(expoFileToRouteURL('app/profile.ts')).toBe('/profile');
    expect(expoFileToRouteURL('app/profile.jsx')).toBe('/profile');
    expect(expoFileToRouteURL('app/profile.js')).toBe('/profile');
  });

  it('returns null for non-app paths', () => {
    expect(expoFileToRouteURL('src/components/Button.tsx')).toBeNull();
    expect(expoFileToRouteURL('lib/utils.ts')).toBeNull();
  });

  it('normalizes backslashes', () => {
    expect(expoFileToRouteURL('app\\(tabs)\\settings.tsx')).toBe('/settings');
  });
});
