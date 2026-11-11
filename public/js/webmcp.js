(() => {
  const modelContext = navigator.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== 'function') return;

  modelContext.registerTool({
    name: 'get_a_kime_business_info',
    title: 'Get A-KIME business information',
    description: 'Returns A-KIME Sarl public services and contact information.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: true,
      consequential: false
    },
    execute: async () => {
      const response = await fetch('/data/business-info.json', {
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`Could not load public business information (${response.status})`);
      }
      return JSON.stringify(await response.json());
    }
  });
})();
