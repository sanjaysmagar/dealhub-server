const request = require('supertest');
const app = require('../../src/server');

describe('Deal routes (integration)', () => {
  let token;

  const validDeal = {
    title: 'Test Deal — 50% off headphones',
    description: 'A great test deal',
    originalPrice: 100,
    discountedPrice: 50,
    category: 'Tech',
    externalLink: 'https://www.ebay.co.uk/itm/999',
    retailer: 'ebay',
  };

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'dealtester',
      email: 'dealtester@example.com',
      password: 'password123',
    });
    token = res.body.token;
  });

  test('POST /api/deals requires authentication', async () => {
    const res = await request(app).post('/api/deals').send(validDeal);
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/deals creates a deal and correctly auto-calculates discountPercent', async () => {
    const res = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send(validDeal);

    expect(res.statusCode).toBe(201);
    expect(res.body.deal.discountPercent).toBe(50);
    expect(res.body.deal.status).toBe('approved');
  });

  test('GET /api/deals returns created deals with pagination info', async () => {
    await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send(validDeal);

    const res = await request(app).get('/api/deals');

    expect(res.statusCode).toBe(200);
    expect(res.body.deals.length).toBe(1);
    expect(res.body.pagination.total).toBe(1);
  });

  test('GET /api/deals/:id returns a single deal', async () => {
    const createRes = await request(app)
      .post('/api/deals')
      .set('Authorization', `Bearer ${token}`)
      .send(validDeal);

    const res = await request(app).get(`/api/deals/${createRes.body.deal._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.title).toBe(validDeal.title);
  });

  test('GET /api/deals/:id returns 404 for a non-existent deal', async () => {
    const res = await request(app).get('/api/deals/507f1f77bcf86cd799439011');
    expect(res.statusCode).toBe(404);
  });

  describe('Voting', () => {
    let dealId, voterToken;

    beforeEach(async () => {
      const createRes = await request(app)
        .post('/api/deals')
        .set('Authorization', `Bearer ${token}`)
        .send(validDeal);
      dealId = createRes.body.deal._id;

      const voterRes = await request(app).post('/api/auth/register').send({
        username: 'votertester',
        email: 'votertester@example.com',
        password: 'password123',
      });
      voterToken = voterRes.body.token;
    });

    test('POST /api/deals/:id/vote requires authentication', async () => {
      const res = await request(app).post(`/api/deals/${dealId}/vote`).send({ voteType: 'up' });
      expect(res.statusCode).toBe(401);
    });

    test('Upvoting increases score and votes.up by 1', async () => {
      const res = await request(app)
        .post(`/api/deals/${dealId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ voteType: 'up' });

      expect(res.statusCode).toBe(200);
      expect(res.body.votes.up).toBe(1);
      expect(res.body.score).toBe(1);
      expect(res.body.myVote).toBe('up');
    });

    test('Voting the same way twice toggles the vote off', async () => {
      await request(app)
        .post(`/api/deals/${dealId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ voteType: 'up' });

      const res = await request(app)
        .post(`/api/deals/${dealId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ voteType: 'up' });

      expect(res.body.votes.up).toBe(0);
      expect(res.body.score).toBe(0);
      expect(res.body.myVote).toBeNull();
    });

    test('Switching from up to down correctly updates both counts', async () => {
      await request(app)
        .post(`/api/deals/${dealId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ voteType: 'up' });

      const res = await request(app)
        .post(`/api/deals/${dealId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ voteType: 'down' });

      expect(res.body.votes.up).toBe(0);
      expect(res.body.votes.down).toBe(1);
      expect(res.body.score).toBe(-1);
      expect(res.body.myVote).toBe('down');
    });
  });
});