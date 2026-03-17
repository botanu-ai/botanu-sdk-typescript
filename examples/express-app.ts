/**
 * Express app example with Botanu middleware and LLM tracking.
 *
 * Run:
 *   BOTANU_API_KEY=btnu_live_... npx tsx examples/express-app.ts
 */

import { enable, botanuExpressMiddleware, trackLlmCall, emitOutcome, runBotanu } from '../src/index.js';

// Initialize SDK before creating the app
enable({
  serviceName: 'support-api',
  environment: 'development',
});

// Example showing how middleware + runBotanu work together
async function handleRequest() {
  // In a real Express app:
  //
  // import express from 'express';
  // const app = express();
  //
  // // Add Botanu middleware (after OTel auto-instrumentation)
  // app.use(botanuExpressMiddleware({ workflow: 'customer_support' }));
  //
  // app.post('/api/tickets/:id/resolve', async (req, res) => {
  //   const result = await runBotanu(
  //     {
  //       name: 'Ticket Resolution',
  //       eventId: req.params.id,
  //       customerId: req.headers['x-customer-id'] as string,
  //     },
  //     async (runCtx) => {
  //       console.log(`Run ${runCtx.runId} started`);
  //
  //       const response = await trackLlmCall(
  //         { vendor: 'openai', model: 'gpt-4' },
  //         async (tracker) => {
  //           // Call your LLM here
  //           const result = { answer: '...', usage: { input: 150, output: 80 } };
  //           tracker.setTokens(result.usage.input, result.usage.output);
  //           return result;
  //         },
  //       );
  //
  //       emitOutcome({
  //         status: 'success',
  //         valueType: 'tickets_resolved',
  //         valueAmount: 1,
  //       });
  //
  //       return response;
  //     },
  //   );
  //
  //   res.json(result);
  // });
  //
  // app.listen(3000);

  console.log('Express app example — see comments in source for full setup.');
}

handleRequest();
