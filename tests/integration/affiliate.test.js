const request = require('supertest');
const app = require('../../src/server');

describe('Affiliate routes (integration)', () => {
  let posterToken, otherToken, dealId;

  const validDeal = {
    title: 'Affiliate Test Deal',
    originalPrice: 100,
    discountedPrice: 80,
    category: 'Tech',
    externalLink: 'https://www.ebay.co.uk/itm/555',
    retailer: 'ebay',
  };

  beforeEach(async () => {
    const posterRes = await request(app).post('/api/auth/register').send({
      username: 'posteruser',
      email: 'poster@example.com',
      password: 'password123',
    });
    posterToken = posterRes.body.token;

    const otherRes = await request(app).post('/api/auth/register').send({
      username: 'otheruser',
      email: 'other@example.com',
      password: 'password123',
    });
    otherToken = otherRes.body.token;

    const dealRes = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${posterToken}`)
      .send(validDeal);
    dealId = dealRes.body.deal._id;
  });

  test('The poster can generate an affiliate link for their own deal', async () => {
    const res = await request(app)
      .post('/api/affiliate/generate')
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ dealId });

    expect(res.statusCode).toBe(201);
    expect(res.body.trackingCode).toBeDefined();
    expect(res.body.shareUrl).toContain(res.body.trackingCode);
  });

  test("A non-poster cannot generate an affiliate link for someone else's deal", async () => {
    const res = await request(app)
      .post('/api/affiliate/generate')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ dealId });

    expect(res.statusCode).toBe(403);
  });

  test('generateLink returns 404 for a non-existent deal', async () => {
    const res = await request(app)
      .post('/api/affiliate/generate')
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ dealId: '507f1f77bcf86cd799439011' });

    expect(res.statusCode).toBe(404);
  });

  test('GET /api/affiliate/go/:trackingCode redirects and awards a click point', async () => {
    const genRes = await request(app)
      .post('/api/affiliate/generate')
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ dealId });
    const { trackingCode } = genRes.body;

    const res = await request(app).get(`/api/affiliate/go/${trackingCode}`);

    expect(res.statusCode).toBe(302);
    // EBAY_CAMPAIGN_ID isn't set in the test environment, so this correctly
    // falls back to the plain external link — same behavior real un-configured
    // retailers get in production.
    expect(res.header.location).toBe(validDeal.externalLink);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${posterToken}`);
    expect(meRes.body.points).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/affiliate/go/:trackingCode returns 404 for an invalid tracking code', async () => {
    const res = await request(app).get('/api/affiliate/go/nonexistent123');
    expect(res.statusCode).toBe(404);
  });
});