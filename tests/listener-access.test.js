const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isAdminOnlyRequest,
  isPublicPageRequest,
  selectListenerRateLimiter,
  isAdminHostname,
  isAdminSelfServiceRequest
} = require('../api/utils/listenerAccess');

test('public listener reserves admin pages and management APIs for the admin port', () => {
  for (const [method, path] of [
    ['GET', '/admin/login'],
    ['GET', '/admin/dashboard.html'],
    ['POST', '/api/auth/admin/login'],
    ['GET', '/api/auth/users'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/delivery-projects'],
    ['GET', '/api/files/delivery-documents/private.pdf'],
    ['PUT', '/api/content/company'],
    ['POST', '/api/content/projects'],
    ['GET', '/api/contact'],
    ['GET', '/api/testimonials/admin/all'],
    ['DELETE', '/api/testimonials/123']
  ]) {
    assert.equal(isAdminOnlyRequest(method, path), true, `${method} ${path}`);
  }
});

test('public listener retains public website and submission endpoints', () => {
  for (const [method, path] of [
    ['GET', '/'],
    ['GET', '/api/content/projects'],
    ['GET', '/api/testimonials'],
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/register'],
    ['POST', '/api/auth/google'],
    ['POST', '/api/contact'],
    ['POST', '/api/testimonials']
  ]) {
    assert.equal(isAdminOnlyRequest(method, path), false, `${method} ${path}`);
  }
});

test('admin listener does not serve public web pages', () => {
  for (const path of ['/index.html', '/about.html', '/test-services']) {
    assert.equal(isPublicPageRequest('GET', path), true, path);
  }
  assert.equal(isPublicPageRequest('GET', '/'), false);
  assert.equal(isPublicPageRequest('GET', '/admin/login.html'), false);
  assert.equal(isPublicPageRequest('GET', '/css/style.css'), false);
});

test('admin and public listeners use their own rate-limit policies', () => {
  const publicLimiter = () => 'public';
  const adminLimiter = () => 'admin';
  assert.equal(selectListenerRateLimiter(false, publicLimiter, adminLimiter), publicLimiter);
  assert.equal(selectListenerRateLimiter(true, publicLimiter, adminLimiter), adminLimiter);
});

test('single-port routing recognizes only the configured admin hostname', () => {
  assert.equal(isAdminHostname('admin.example.com', 'admin.example.com'), true);
  assert.equal(isAdminHostname('ADMIN.EXAMPLE.COM.', 'admin.example.com'), true);
  assert.equal(isAdminHostname('www.example.com', 'admin.example.com'), false);
  assert.equal(isAdminHostname(undefined, 'admin.example.com'), false);
});

test('admin path mode permits only shared authentication self-service requests', () => {
  for (const [method, path] of [
    ['GET', '/api/auth/me'],
    ['GET', '/api/auth/verify'],
    ['POST', '/api/auth/refresh'],
    ['POST', '/api/auth/logout'],
    ['POST', '/api/auth/logout-all']
  ]) {
    assert.equal(isAdminSelfServiceRequest(method, path), true, `${method} ${path}`);
  }

  for (const [method, path] of [
    ['POST', '/api/auth/login'],
    ['POST', '/api/auth/admin/login'],
    ['GET', '/api/auth/users'],
    ['POST', '/api/auth/me/avatar'],
    ['DELETE', '/api/auth/logout-all']
  ]) {
    assert.equal(isAdminSelfServiceRequest(method, path), false, `${method} ${path}`);
  }
});
