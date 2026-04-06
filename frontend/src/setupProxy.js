/**
 * Dev-server proxy for /api and /ws so the CRA app can call the backend.
 * - Local `npm run dev`: uses PROXY_TARGET from .env.development (localhost).
 * - Docker Compose frontend service: set PROXY_TARGET=http://backend:3000.
 *
 * OWASP / Zoom Apps: the dev server serves `/` (not the backend), so we set the same
 * security headers here that `backend/src/server.js` applies via helmet.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

/** Align with backend helmet CSP (plus unsafe-eval in dev for webpack / HMR). */
function devContentSecurityPolicy() {
  const script =
    process.env.NODE_ENV === 'production'
      ? "'self' appssdk.zoom.us 'unsafe-inline'"
      : "'self' appssdk.zoom.us 'unsafe-inline' 'unsafe-eval'";
  return [
    `default-src 'self'`,
    `script-src ${script}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self'`,
    `img-src 'self' data: https:`,
    `connect-src 'self' wss: https:`,
    `frame-src 'self' appssdk.zoom.us`,
  ].join('; ');
}

function zoomSecurityHeaders(req, res, next) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', devContentSecurityPolicy());
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

module.exports = function setupProxy(app) {
  app.use(zoomSecurityHeaders);

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
