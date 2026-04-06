/**
 * Dev-server proxy for /api and /ws so the CRA app can call the backend.
 * - Local `npm run dev`: uses PROXY_TARGET from .env.development (localhost).
 * - Docker Compose frontend service: set PROXY_TARGET=http://backend:3000.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const target =
    process.env.PROXY_TARGET ||
    process.env.REACT_APP_PROXY_TARGET ||
    'http://127.0.0.1:3000';

  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );

  app.use(
    '/ws',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
    })
  );
};
