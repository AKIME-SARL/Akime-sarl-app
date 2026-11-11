function isAdminOnlyRequest(method, requestPath) {
  const path = requestPath.toLowerCase();
  const verb = method.toUpperCase();

  if (path === '/admin' || path.startsWith('/admin/')) return true;
  if (path === '/api/auth' || path.startsWith('/api/auth/')) {
    if (path === '/api/auth/register' ||
        path === '/api/auth/login' ||
        path === '/api/auth/google' ||
        path === '/api/auth/refresh' ||
        path === '/api/auth/logout' ||
        path === '/api/auth/logout-all' ||
        path === '/api/auth/verify' ||
        path === '/api/auth/me' ||
        path === '/api/auth/me/avatar' ||
        path === '/api/auth/gdpr/export' ||
        path === '/api/auth/gdpr/delete') {
      return false;
    }
    return true;
  }
  if (path === '/api/admin' || path.startsWith('/api/admin/')) return true;
  if (path === '/api/delivery-projects' || path.startsWith('/api/delivery-projects/')) return true;
  if (path.startsWith('/api/files/delivery-documents/')) return true;
  if (path === '/api/content' || path.startsWith('/api/content/')) {
    return verb !== 'GET' && verb !== 'HEAD';
  }
  if (path === '/api/contact' || path.startsWith('/api/contact/')) {
    return !(verb === 'POST' && path === '/api/contact');
  }
  if (path === '/api/testimonials' || path.startsWith('/api/testimonials/')) {
    return !(verb === 'GET' && path === '/api/testimonials') &&
      !(verb === 'POST' && path === '/api/testimonials');
  }

  return false;
}

function isPublicPageRequest(method, requestPath) {
  if (method !== 'GET' && method !== 'HEAD') return false;

  const path = requestPath.toLowerCase();
  if (path === '/test-services') return true;
  return path.endsWith('.html') && path !== '/admin/login.html' &&
    path !== '/admin/dashboard.html';
}

function selectListenerRateLimiter(isAdminListener, publicLimiter, adminLimiter) {
  return isAdminListener ? adminLimiter : publicLimiter;
}

function isAdminHostname(requestHostname, adminHostname) {
  if (typeof requestHostname !== 'string' || typeof adminHostname !== 'string') return false;
  return requestHostname.trim().toLowerCase().replace(/\.$/, '') ===
    adminHostname.trim().toLowerCase().replace(/\.$/, '');
}

function isAdminSelfServiceRequest(method, requestUrl) {
  const verb = method.toUpperCase();
  const path = requestUrl.split('?')[0].toLowerCase();
  return (verb === 'GET' && ['/api/auth/me', '/api/auth/verify'].includes(path)) ||
    (verb === 'POST' && [
      '/api/auth/refresh',
      '/api/auth/logout',
      '/api/auth/logout-all'
    ].includes(path));
}

module.exports = {
  isAdminOnlyRequest,
  isPublicPageRequest,
  selectListenerRateLimiter,
  isAdminHostname,
  isAdminSelfServiceRequest
};
