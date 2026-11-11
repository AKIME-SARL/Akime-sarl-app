const { isIP } = require('node:net');

function assertMongoTlsEnabled(uri) {
  const match = typeof uri === 'string' &&
    /^(mongodb(?:\+srv)?:\/\/)([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/i.exec(uri);
  if (!match || /\s/.test(uri)) {
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI');
  }

  const [, scheme, authority, pathname = '/', query = ''] = match;
  const atIndex = authority.lastIndexOf('@');
  const credentials = atIndex >= 0 ? `${authority.slice(0, atIndex)}@` : '';
  const hosts = (atIndex >= 0 ? authority.slice(atIndex + 1) : authority).split(',');
  if (!hosts.length || hosts.some(host => !host) ||
      (scheme.toLowerCase() === 'mongodb+srv://' && hosts.length !== 1)) {
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI');
  }

  try {
    for (const host of hosts) {
      new URL(`${scheme}${credentials}${host}${pathname}${query}`);
    }
  } catch {
    throw new Error('MONGODB_URI must be a valid MongoDB connection URI');
  }

  const parsedUri = new URL(`${scheme}${credentials}${hosts[0]}${pathname}${query}`);
  const tlsOption = parsedUri.searchParams.has('tls')
    ? parsedUri.searchParams.get('tls')
    : parsedUri.searchParams.get('ssl');
  const tlsEnabled = tlsOption
    ? tlsOption.toLowerCase() === 'true'
    : parsedUri.protocol.toLowerCase() === 'mongodb+srv:';

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

function assertAdminPathMode(enabled, singlePortMode, adminUrl, baseUrl) {
  if (!enabled) return;
  if (!singlePortMode) {
    throw new Error('ADMIN_PATH_MODE requires SINGLE_PORT_MODE=true');
  }

  let adminOrigin;
  let baseOrigin;
  try {
    const parsedAdminUrl = new URL(adminUrl);
    const parsedBaseUrl = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new Error();
    }
    adminOrigin = parsedAdminUrl.origin;
    baseOrigin = parsedBaseUrl.origin;
  } catch {
    throw new Error('ADMIN_URL and BASE_URL must be valid HTTP(S) URLs when ADMIN_PATH_MODE=true');
  }

  if (adminOrigin !== baseOrigin) {
    throw new Error('ADMIN_URL and BASE_URL must match when ADMIN_PATH_MODE=true');
  }
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
  assertAdminPathMode,
  getAdminLoginUrl,
  isPrivateAdminHost
};
