/**
 * Basic usage example — minimal workflow tracing with Botanu SDK.
 *
 * Run:
 *   BOTANU_API_KEY=btnu_live_... npx tsx examples/basic.ts
 */

import { enable, botanuWorkflow, emitOutcome, trackLlmCall } from '../src/index.js';

// 1. Initialize the SDK (reads config from env vars)
enable({
  serviceName: 'my-ai-app',
  environment: 'development',
});

// 2. Define a workflow
const handleTicket = botanuWorkflow(
  {
    name: 'Customer Support',
    eventId: 'ticket-42',
    customerId: 'acme-corp',
  },
  async () => {
    // 3. Track an LLM call
    const response = await trackLlmCall(
      { vendor: 'openai', model: 'gpt-4' },
      async (tracker) => {
        // Simulate an LLM response
        const result = { content: 'Hello!', usage: { input: 100, output: 50 } };
        tracker.setTokens(result.usage.input, result.usage.output);
        tracker.setRequestId('resp-abc123');
        return result;
      },
    );

    // 4. Emit outcome
    emitOutcome({
      status: 'success',
      valueType: 'tickets_resolved',
      valueAmount: 1,
    });

    return response;
  },
);

// Run it
handleTicket().then(() => console.log('Done!'));
