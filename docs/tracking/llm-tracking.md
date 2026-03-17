# LLM Tracking

Track AI model usage for accurate cost attribution across providers.

## Overview

Botanu provides LLM tracking that aligns with [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). This ensures compatibility with standard observability tooling while enabling detailed cost analysis.

## Basic Usage

### Wrapper Function (Recommended)

```typescript
import { trackLlmCall } from '@botanu/sdk';

await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async (tracker) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    tracker.setTokens({
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    });
    tracker.setRequestId(response.id);
  }
);
```

### What Gets Recorded

| Attribute | Example | Description |
|-----------|---------|-------------|
| `gen_ai.operation.name` | `chat` | Type of operation |
| `gen_ai.provider.name` | `openai` | Normalized provider name |
| `gen_ai.request.model` | `gpt-4` | Requested model |
| `gen_ai.response.model` | `gpt-4-0613` | Actual model used |
| `gen_ai.usage.input_tokens` | `150` | Input/prompt tokens |
| `gen_ai.usage.output_tokens` | `200` | Output/completion tokens |
| `gen_ai.response.id` | `chatcmpl-...` | Provider request ID |

## LLMTracker Methods

### setTokens()

Record token usage from the response:

```typescript
tracker.setTokens({
  inputTokens: 150,
  outputTokens: 200,
  cachedTokens: 50,        // For providers with caching
  cacheReadTokens: 50,     // Anthropic-style cache read
  cacheWriteTokens: 100,   // Anthropic-style cache write
});
```

### setRequestId()

Record provider and client request IDs for billing reconciliation:

```typescript
tracker.setRequestId(response.id, 'my-client-123');
```

### setResponseModel()

When the response uses a different model than requested:

```typescript
tracker.setResponseModel('gpt-4-0613');
```

### setRequestParams()

Record request parameters for analysis:

```typescript
tracker.setRequestParams({
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1000,
  stopSequences: ['END'],
  frequencyPenalty: 0.5,
  presencePenalty: 0.3,
});
```

### setStreaming()

Mark as a streaming request:

```typescript
tracker.setStreaming(true);
```

### setCacheHit()

Mark as a cache hit (for semantic caching):

```typescript
tracker.setCacheHit(true);
```

### setAttempt()

Track retry attempts:

```typescript
tracker.setAttempt(2); // Second attempt
```

### setFinishReason()

Record the stop reason:

```typescript
tracker.setFinishReason('stop'); // or "length", "content_filter", etc.
```

### setError()

Record errors (automatically called on exceptions):

```typescript
try {
  const response = await client.chat(/* ... */);
} catch (e) {
  tracker.setError(e as Error);
  throw e;
}
```

### addMetadata()

Add custom attributes:

```typescript
tracker.addMetadata({
  promptVersion: 'v2.1',
  experimentId: 'exp-123',
});
```

## Operation Types

Use `ModelOperation` constants for the `operation` parameter:

```typescript
import { trackLlmCall, ModelOperation } from '@botanu/sdk';

// Chat completion
await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4', operation: ModelOperation.CHAT },
  async (tracker) => { /* ... */ }
);

// Embeddings
await trackLlmCall(
  { vendor: 'openai', model: 'text-embedding-3-small', operation: ModelOperation.EMBEDDINGS },
  async (tracker) => { /* ... */ }
);

// Text completion (legacy)
await trackLlmCall(
  { vendor: 'openai', model: 'davinci', operation: ModelOperation.TEXT_COMPLETION },
  async (tracker) => { /* ... */ }
);
```

Available operations:

| Constant | Value | Use Case |
|----------|-------|----------|
| `CHAT` | `chat` | Chat completions (default) |
| `TEXT_COMPLETION` | `text_completion` | Legacy completions |
| `EMBEDDINGS` | `embeddings` | Embedding generation |
| `GENERATE_CONTENT` | `generate_content` | Generic content generation |
| `EXECUTE_TOOL` | `execute_tool` | Tool/function execution |
| `CREATE_AGENT` | `create_agent` | Agent creation |
| `INVOKE_AGENT` | `invoke_agent` | Agent invocation |
| `RERANK` | `rerank` | Reranking |
| `IMAGE_GENERATION` | `image_generation` | Image generation |
| `SPEECH_TO_TEXT` | `speech_to_text` | Transcription |
| `TEXT_TO_SPEECH` | `text_to_speech` | Speech synthesis |

## Provider Normalization

Provider names are automatically normalized:

| Input | Normalized |
|-------|------------|
| `openai`, `OpenAI` | `openai` |
| `azure_openai`, `azure-openai` | `azure.openai` |
| `anthropic`, `claude` | `anthropic` |
| `bedrock`, `aws_bedrock` | `aws.bedrock` |
| `vertex`, `vertexai`, `gemini` | `gcp.vertex_ai` |
| `cohere` | `cohere` |
| `mistral`, `mistralai` | `mistral` |
| `together`, `togetherai` | `together` |
| `groq` | `groq` |

## Tool/Function Tracking

Track tool calls triggered by LLMs:

```typescript
import { trackToolCall } from '@botanu/sdk';

await trackToolCall(
  { toolName: 'search_database', toolCallId: 'call_abc123' },
  async (tool) => {
    const results = await doWork(query);
    tool.setResult({
      success: true,
      itemsReturned: results.length,
      bytesProcessed: 1024,
    });
  }
);
```

### ToolTracker Methods

```typescript
// Set execution result
tool.setResult({
  success: true,
  itemsReturned: 10,
  bytesProcessed: 2048,
});

// Set tool call ID from LLM response
tool.setToolCallId('call_abc123');

// Record error
tool.setError(error);

// Add custom metadata
tool.addMetadata({ queryType: 'semantic' });
```

## Standalone Helpers

For cases where you cannot use wrapper functions:

### setLlmAttributes()

```typescript
import { setLlmAttributes } from '@botanu/sdk';

setLlmAttributes({
  provider: 'openai',
  model: 'gpt-4',
  operation: 'chat',
  inputTokens: 150,
  outputTokens: 200,
  streaming: true,
  providerRequestId: 'chatcmpl-...',
});
```

### setTokenUsage()

```typescript
import { setTokenUsage } from '@botanu/sdk';

setTokenUsage({
  inputTokens: 150,
  outputTokens: 200,
  cachedTokens: 50,
});
```

## Decorator for Auto-Instrumentation

For wrapping existing client methods:

```typescript
import { llmInstrumented } from '@botanu/sdk';

class MyOpenAIClient {
  @llmInstrumented({ vendor: 'openai', tokensFromResponse: true })
  async chat(model: string, messages: any[]) {
    return openai.chat.completions.create({ model, messages });
  }
}
```

Or as a function wrapper:

```typescript
import { llmInstrumented } from '@botanu/sdk';

const instrumentedChat = llmInstrumented(
  { vendor: 'openai' },
  async (model: string, messages: any[]) => {
    return openai.chat.completions.create({ model, messages });
  }
);
```

## Metrics

The SDK automatically records these metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `gen_ai.client.token.usage` | Histogram | Token counts by type |
| `gen_ai.client.operation.duration` | Histogram | Operation duration in seconds |
| `botanu.gen_ai.attempts` | Counter | Request attempts (including retries) |

## Example: Multi-Provider Workflow

```typescript
import { botanuWorkflow, emitOutcome, trackLlmCall } from '@botanu/sdk';

async function processWithFallback(data: string, eventId: string, customerId: string) {
  return botanuWorkflow(
    { name: 'process-with-fallback', eventId, customerId },
    async () => {
      try {
        return await trackLlmCall(
          { vendor: 'anthropic', model: 'claude-3-opus' },
          async (tracker) => {
            tracker.setAttempt(1);
            const response = await doWork(data, 'anthropic');
            tracker.setTokens({
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            });
            emitOutcome('success', { valueType: 'items_processed', valueAmount: 1 });
            return response.content;
          }
        );
      } catch (e) {
        if (!(e instanceof RateLimitError)) throw e;

        // Fallback to second provider
        return await trackLlmCall(
          { vendor: 'openai', model: 'gpt-4' },
          async (tracker) => {
            tracker.setAttempt(2);
            const response = await doWork(data, 'openai');
            tracker.setTokens({
              inputTokens: response.usage.prompt_tokens,
              outputTokens: response.usage.completion_tokens,
            });
            emitOutcome('success', { valueType: 'items_processed', valueAmount: 1 });
            return response.content;
          }
        );
      }
    }
  );
}
```

## See Also

- [Auto-Instrumentation](../integration/auto-instrumentation.md) - Automatic LLM tracking
- [Data Tracking](data-tracking.md) - Database and storage tracking
- [Outcomes](outcomes.md) - Recording business outcomes
