// Loaded before any test module is required. Sets env vars the app needs at import time.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
process.env.BALLDONTLIE_API_KEY = 'test-key';
process.env.CORS_ORIGIN = 'http://localhost:3000';
