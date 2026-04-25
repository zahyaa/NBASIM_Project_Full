require('./setup');
const request = require('supertest');
const app = require('../server');

describe('POST /api/auth/register', () => {
  test('creates a new user and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'alice', password: 'secret123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('alice');
    // Sanity: password hash must not be returned in plaintext form
    expect(res.body.user.password).not.toBe('secret123');
  });

  test('rejects short passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'bob', password: '123' });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate usernames', async () => {
    await request(app).post('/api/auth/register').send({ username: 'dup', password: 'secret123' });
    const res = await request(app).post('/api/auth/register').send({ username: 'dup', password: 'secret456' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ username: 'carol', password: 'secret123' });
  });

  test('returns a token on valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'carol', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'carol', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  test('401 on unknown user (no user enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'secret123' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns the current user with a valid token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ username: 'dave', password: 'secret123' });
    const token = reg.body.token;
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('dave');
    expect(res.body.password).toBeUndefined();
  });
});
