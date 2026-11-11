const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const businessInfo = require('../../public/data/business-info.json');

function createMcpServer() {
  const server = new McpServer(
    { name: 'com.a-kime/website', version: '6.2.0' },
    { capabilities: { tools: {} } }
  );

  server.registerTool('get_business_info', {
    title: 'Get A-KIME business information',
    description: 'Returns public company information, services and contact links for A-KIME Sarl.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false }
  }, async () => ({
    content: [{ type: 'text', text: JSON.stringify(businessInfo) }]
  }));

  return server;
}

function createMcpRequestHandler() {
  return async function handleMcpRequest(req, res) {
    const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
    const mcpServer = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.once('close', () => {
      transport.close().catch(error => console.error('❌ MCP transport close failed:', error.message));
      mcpServer.close().catch(error => console.error('❌ MCP server close failed:', error.message));
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('❌ MCP request failed:', error.message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  };
}

module.exports = { createMcpRequestHandler, createMcpServer };
