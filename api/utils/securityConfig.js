const { isIP } = require('node:net');

function assertMongoTlsEnabled(uri) {
  let parsedUri;
  try {
    parsedUri = new URL(uri);
  } catch (error) {
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI');
  }

  const tlsOption = parsedUri.searchParams.get('tls') || parsedUri.searchParams.get('ssl');
  const tlsEnabled = tlsOption
    ? tlsOption.toLowerCase() === 'true'
    : parsedUri.protocol === 'mongodb+srv:';

  if (!tlsEnabled) {
    throw new Error('Production MONGODB_URI must enable TLS (mongodb+srv or tls=true)');
  }
}

function getAdminLoginUrl(value, isProd = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ADMIN_URL must be a valid absolute HTTP(S) URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('ADMIN_URL must be a valid absolute HTTP(S) URL');
  }
  if (url.username || url.password || url.pathname !== '/' ||
      url.search || url.hash) {
    throw new Error('ADMIN_URL must contain only an HTTP(S) origin');
  }
  if (isProd && url.protocol !== 'https:') {
    throw new Error('Production ADMIN_URL must use HTTPS');
  }

  return new URL('/admin/login', url.origin).toString();
}

function isPrivateAdminHost(host) {
  const normalizedHost = host.trim().toLowerCase();
  if (normalizedHost === 'localhost' || normalizedHost === '::1') return true;

  const ipVersion = isIP(normalizedHost);
  if (ipVersion === 4) {
    const [first, second] = normalizedHost.split('.').map(Number);
    return first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      first === 127;
  }

  return ipVersion === 6 && /^(fc|fd)/i.test(normalizedHost);
}

module.exports = {
  assertMongoTlsEnabled,
  getAdminLoginUrl,
  isPrivateAdminHost
};
