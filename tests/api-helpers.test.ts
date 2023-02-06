import { rewriteVersionedUrl } from '../src/api/util/helpers';

describe('API helpers', () => {
  test('rewrites versioned URLs', () => {
    expect(rewriteVersionedUrl()).toBe('/');
    expect(rewriteVersionedUrl('/')).toBe('/');
    expect(rewriteVersionedUrl('/not-valid')).toBe('/not-valid');
    expect(rewriteVersionedUrl('/metadata/test/url')).toBe('/metadata/v1/test/url');
    expect(rewriteVersionedUrl('/metadata/v1/test/url')).toBe('/metadata/v1/test/url');
    expect(rewriteVersionedUrl('/metadata/v2/test/url')).toBe('/metadata/v2/test/url');
    expect(rewriteVersionedUrl('/metadata/v74/test')).toBe('/metadata/v74/test');
  });
});
