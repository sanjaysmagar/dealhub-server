const request = require('supertest');
const app = require('../../src/server');

describe('Auth routes (integration)', () => {
  const testUser = {
    username: 'testuser1',
    email: 'testuser1@example.com',
    password: 'password123',
  };

  test('POST /api/auth/register creates a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(testUser);

    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.password).toBeUndefined();
  });

  test('POST /api/auth/register rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(testUser);

    const res = await request(app).post('/api/auth/register').send({
      ...testUser,
      username: 'differentusername',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/email already registered/i);
  });

  test('POST /api/auth/register rejects a duplicate username', async () => {
    await request(app).post('/api/auth/register').send(testUser);

    const res = await request(app).post('/api/auth/register').send({
      ...testUser,
      email: 'different@example.com',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/username already taken/i);
  });

  test('POST /api/auth/login succeeds with correct credentials', async () => {
    await request(app).post('/api/auth/register').send(testUser);

    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('POST /api/auth/login rejects an incorrect password', async () => {
    await request(app).post('/api/auth/register').send(testUser);

    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: 'wrongpassword',
    });

    expect(res.statusCode).toBe(401);
  });

  test('POST /api/auth/login rejects a non-existent email', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'whatever',
    });

    expect(res.statusCode).toBe(401);
  });

  test('GET /api/auth/me rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });

  test('GET /api/auth/me returns the user profile with a valid token', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(testUser);
    const token = registerRes.body.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.email).toBe(testUser.email);
  });
});