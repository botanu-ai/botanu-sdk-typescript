/**
 * Fastify app example with Botanu plugin.
 *
 * Run:
 *   BOTANU_API_KEY=btnu_live_... npx tsx examples/fastify-app.ts
 */

import { enable, botanuFastifyPlugin, runBotanu, trackLlmCall, emitOutcome } from '../src/index.js';

// Initialize SDK
enable({
  serviceName: 'fastify-api',
  environment: 'development',
});

// Example showing how the Fastify plugin works
async function main() {
  // In a real Fastify app:
  //
  // import Fastify from 'fastify';
  // const app = Fastify();
  //
  // // Register Botanu plugin
  // app.register(botanuFastifyPlugin, { workflow: 'customer_support' });
  //
  // app.post('/api/chat', async (request, reply) => {
  //   return runBotanu(
  //     {
  //       name: 'Chat Completion',
  //       eventId: request.body.conversationId,
  //       customerId: request.body.customerId,
  //     },
  //     async (runCtx) => {
  //       const response = await trackLlmCall(
  //         { vendor: 'anthropic', model: 'claude-3-opus' },
  //         async (tracker) => {
  //           const result = { content: '...', usage: { input_tokens: 200, output_tokens: 100 } };
  //           tracker.setTokens(result.usage.input_tokens, result.usage.output_tokens);
  //           return result;
  //         },
  //       );
  //
  //       emitOutcome({ status: 'success' });
  //       return { response: response.content };
  //     },
  //   );
  // });
  //
  // await app.listen({ port: 3000 });

  console.log('Fastify app example — see comments in source for full setup.');
}

main();
