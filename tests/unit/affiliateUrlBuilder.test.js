describe('buildAffiliateUrl (unit)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('builds a correctly formatted eBay tracking URL when EBAY_CAMPAIGN_ID is set', () => {
    process.env.EBAY_CAMPAIGN_ID = '5339165834';
    process.env.EBAY_ROTATION_ID = '710-53481-19255-0';
    const { buildAffiliateUrl } = require('../../src/utils/affiliateUrlBuilder');

    const { url, platform } = buildAffiliateUrl({
      externalLink: 'https://www.ebay.co.uk/itm/12345',
      retailer: 'ebay',
      customId: 'abc123',
    });

    expect(platform).toBe('ebay');
    expect(url).toContain('mkevt=1');
    expect(url).toContain('campid=5339165834');
    expect(url).toContain('customid=abc123');
    expect(url).toContain('toolid=10001');
  });

  test('returns a null url for eBay deals when EBAY_CAMPAIGN_ID is not configured', () => {
    delete process.env.EBAY_CAMPAIGN_ID;
    const { buildAffiliateUrl } = require('../../src/utils/affiliateUrlBuilder');

    const { url, platform } = buildAffiliateUrl({
      externalLink: 'https://www.ebay.co.uk/itm/12345',
      retailer: 'ebay',
      customId: 'abc123',
    });

    expect(url).toBeNull();
    expect(platform).toBeNull();
  });

  test('appends params using "&" when the URL already has a query string', () => {
    process.env.EBAY_CAMPAIGN_ID = '5339165834';
    const { buildAffiliateUrl } = require('../../src/utils/affiliateUrlBuilder');

    const { url } = buildAffiliateUrl({
      externalLink: 'https://www.ebay.co.uk/itm/12345?ref=search',
      retailer: 'ebay',
      customId: 'abc123',
    });

    expect(url).toContain('?ref=search&mkevt=1');
  });

  test('routes non-eBay retailers through Skimlinks', () => {
    process.env.SKIMLINKS_PUBLISHER_ID = 'pub123';
    const { buildAffiliateUrl } = require('../../src/utils/affiliateUrlBuilder');

    const { url, platform } = buildAffiliateUrl({
      externalLink: 'https://www.amazon.co.uk/dp/B0EXAMPLE',
      retailer: 'amazon',
      customId: 'abc123',
    });

    expect(platform).toBe('skimlinks');
    expect(url).toContain('go.skimresources.com');
    expect(url).toContain('id=pub123');
  });

  test('returns a null url for non-eBay retailers when Skimlinks is not configured', () => {
    delete process.env.SKIMLINKS_PUBLISHER_ID;
    const { buildAffiliateUrl } = require('../../src/utils/affiliateUrlBuilder');

    const { url, platform } = buildAffiliateUrl({
      externalLink: 'https://www.amazon.co.uk/dp/B0EXAMPLE',
      retailer: 'amazon',
      customId: 'abc123',
    });

    expect(url).toBeNull();
    expect(platform).toBeNull();
  });
});