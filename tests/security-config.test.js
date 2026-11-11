const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertAdminPathMode,
  assertMongoTlsEnabled,
  getAdminLoginUrl,
  isPrivateAdminHost
} = require('../api/utils/securityConfig');

test('production accepts MongoDB SRV URIs with default TLS', () => {
  assert.doesNotThrow(() => assertMongoTlsEnabled('mongodb+srv://db.example.test/akime'));
});

test('production accepts standard MongoDB URIs only with explicit TLS', () => {
  assert.doesNotThrow(() => assertMongoTlsEnabled('mongodb://db.example.test/akime?tls=true'));
  assert.doesNotThrow(() => assertMongoTlsEnabled('mongodb://db.example.test/akime?ssl=true'));
  assert.doesNotThrow(() => assertMongoTlsEnabled(
    'mongodb://one.example.test:27017,two.example.test:27017/akime?ssl=true'
  ));
});

test('production rejects MongoDB URIs with TLS disabled or unspecified', () => {
  assert.throws(() => assertMongoTlsEnabled('mongodb://db.example.test/akime'), /must enable TLS/);
  assert.throws(() => assertMongoTlsEnabled(
    'mongodb://db.example.test/akime?tls=false&ssl=true'
  ), /must enable TLS/);
  assert.throws(() => assertMongoTlsEnabled('mongodb+srv://db.example.test/akime?tls=false'), /must enable TLS/);
});

test('production rejects malformed MongoDB URIs', () => {
  assert.throws(() => assertMongoTlsEnabled('not-a-mongodb-uri'), /valid MongoDB connection URI/);
});

test('admin login URL is configured as a safe origin and uses HTTPS in production', () => {
  assert.equal(getAdminLoginUrl('http://localhost:4001'), 'http://localhost:4001/admin/login');
  assert.equal(getAdminLoginUrl('https://admin.example.test', true), 'https://admin.example.test/admin/login');
  assert.throws(() => getAdminLoginUrl('http://admin.example.test', true), /must use HTTPS/);
  assert.throws(() => getAdminLoginUrl('javascript:alert(1)'), /valid absolute HTTP\(S\) URL/);
  assert.throws(() => getAdminLoginUrl('https://user:pass@admin.example.test'), /only an HTTP\(S\) origin/);
  assert.throws(() => getAdminLoginUrl('https://admin.example.test/path'), /only an HTTP\(S\) origin/);
});

test('admin path mode requires single-port mode and the same public origin', () => {
  assert.doesNotThrow(() => assertAdminPathMode(
    true, true, 'https://a-kime.com', 'https://a-kime.com'
  ));
  assert.doesNotThrow(() => assertAdminPathMode(
    false, false, 'https://admin.a-kime.com', 'https://a-kime.com'
  ));
  assert.throws(() => assertAdminPathMode(
    true, false, 'https://a-kime.com', 'https://a-kime.com'
  ), /requires SINGLE_PORT_MODE=true/);
  assert.throws(() => assertAdminPathMode(
    true, true, 'https://admin.a-kime.com', 'https://a-kime.com'
  ), /must match/);
  assert.throws(() => assertAdminPathMode(
    true, true, 'https://a-kime.com', 'not-an-origin'
  ), /valid HTTP\(S\) URLs/);
});

test('admin listener accepts loopback and private network interfaces only', () => {
  for (const host of ['127.0.0.1', 'localhost', '10.20.30.40', '172.20.0.3', '192.168.1.5', 'fd00::2']) {
    assert.equal(isPrivateAdminHost(host), true, host);
  }
  for (const host of ['0.0.0.0', '8.8.8.8', '172.32.0.1', '2001:4860:4860::8888']) {
    assert.equal(isPrivateAdminHost(host), false, host);
  }
});
