const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createMcpRequestHandler, createMcpServer } = require('../api/utils/mcpServer');
const { acceptsMarkdown, homepageLinkHeader } = require('../api/utils/agentContent');

const publicDir = path.join(__dirname, '..', 'public');
const readPublicFile = file => fs.readFileSync(path.join(publicDir, file), 'utf8');

test('robots policy is parseable and points to the public sitemap', () => {
  const robots = readPublicFile('robots.txt');
  assert.match(robots, /^User-agent: \*\s+Allow: \/\s+/);
  assert.match(robots, /^Content-Signal: search=yes, ai-train=no$/m);
  assert.match(robots, /^Sitemap: https:\/\/a-kime\.com\/sitemap\.xml$/m);
});

test('sitemap lists only published public pages with valid absolute URLs', () => {
  const sitemap = readPublicFile('sitemap.xml');
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
  assert.deepEqual(urls, [
    'https://a-kime.com/',
    'https://a-kime.com/mentions-legales.html'
  ]);
  for (const url of urls) assert.doesNotThrow(() => new URL(url));
  assert.match(sitemap, /<\/urlset>\s*$/);
});

test('homepage metadata and JSON-LD identify the business, website and services', () => {
  const html = readPublicFile('index.html');
  assert.match(html, /<link rel="canonical" href="https:\/\/a-kime\.com\/">/);
  assert.match(html, /<meta name="description" content="[^"]+">/);
  const [, jsonLd] = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/) || [];
  assert.ok(jsonLd, 'homepage JSON-LD block should exist');
  const graph = JSON.parse(jsonLd)['@graph'];
  assert.ok(graph.some(node => node['@type'] === 'GeneralContractor'));
  assert.ok(graph.some(node => node['@type'] === 'WebSite'));
  assert.ok(graph.some(node => node['@type'] === 'WebPage'));
  assert.ok(graph.some(node => node['@type'] === 'Service'));
  const company = graph.find(node => node['@type'] === 'GeneralContractor');
  assert.deepEqual(company.sameAs, [
    'https://facebook.com/akime',
    'https://linkedin.com/company/akime'
  ]);
  assert.match(html, /href="\/#about"/);
  assert.match(html, /href="\/#contact"/);
  assert.match(html, /href="\/mentions-legales\.html"/);
});

test('LLM index, Markdown homepage and legal page are present and linked', () => {
  const llms = readPublicFile('llms.txt');
  const markdown = readPublicFile('index.md');
  const legal = readPublicFile('mentions-legales.html');
  assert.match(llms, /https:\/\/a-kime\.com\/#about/);
  assert.match(llms, /https:\/\/a-kime\.com\/#contact/);
  assert.match(llms, /https:\/\/a-kime\.com\/mentions-legales\.html/);
  assert.match(markdown, /^# A-KIME Sarl/m);
  assert.match(legal, /id="confidentialite"/);
});

test('Markdown negotiation requires an explicit positive text/markdown preference', () => {
  assert.equal(acceptsMarkdown('text/markdown'), true);
  assert.equal(acceptsMarkdown('text/html, text/markdown;q=0.8'), true);
  assert.equal(acceptsMarkdown('text/markdown;q=0'), false);
  assert.equal(acceptsMarkdown('text/markdown;q=0.00'), false);
  assert.equal(acceptsMarkdown('text/html, */*'), false);
  assert.match(homepageLinkHeader, /rel="alternate"; type="text\/markdown"/);
  assert.match(homepageLinkHeader, /rel="describedby"; type="text\/plain"/);
});

test('MCP Server Card points to the implemented read-only tool endpoint', async () => {
  const card = JSON.parse(readPublicFile('mcp/server-card.json'));
  assert.equal(card.remotes[0].type, 'streamable-http');
  assert.equal(card.remotes[0].url, 'https://a-kime.com/mcp');
  assert.ok(card.capabilities.tools);

  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'agent-readiness-test', version: '1.0.0' });
  try {
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport)
    ]);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ['get_business_info']);
    const result = await client.callTool({ name: 'get_business_info', arguments: {} });
    const businessInfo = JSON.parse(result.content[0].text);
    assert.equal(businessInfo.name, 'A-KIME Sarl');
    assert.deepEqual(businessInfo.sameAs, [
      'https://facebook.com/akime',
      'https://linkedin.com/company/akime'
    ]);
  } finally {
    await client.close();
    await server.close();
  }
});

test('Streamable HTTP MCP endpoint supports initialization and tool calls', async t => {
  const app = express();
  app.use(express.json());
  app.post('/mcp', createMcpRequestHandler());
  app.get('/mcp', (req, res) => res.status(405).set('Allow', 'POST').end());
  const httpServer = http.createServer(app);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => httpServer.close(resolve)));

  const address = httpServer.address();
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${address.port}/mcp`)
  );
  const client = new Client({ name: 'agent-readiness-http-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name), ['get_business_info']);
    const result = await client.callTool({ name: 'get_business_info', arguments: {} });
    assert.equal(JSON.parse(result.content[0].text).name, 'A-KIME Sarl');
  } finally {
    await client.close();
  }
});

test('WebMCP tool is registered only when the browser supports the API', () => {
  const script = readPublicFile('js/webmcp.js');
  assert.match(script, /navigator\.modelContext/);
  assert.match(script, /registerTool\(/);
  assert.match(script, /inputSchema:/);
  assert.match(script, /execute:/);
});
