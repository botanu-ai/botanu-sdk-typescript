# Tracking API Reference

## LLM Tracking

### trackLlmCall()

Wrapper function for tracking LLM/model calls.

```typescript
import { trackLlmCall } from '@botanu/sdk';

trackLlmCall<T>(
  options: {
    vendor: string;
    model: string;
    operation?: string;
    clientRequestId?: string;
    [key: string]: any;
  },
  fn: (tracker: LLMTracker) => Promise<T>
): Promise<T>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `vendor` | `string` | Required | LLM provider (openai, anthropic, etc.) |
| `model` | `string` | Required | Model name/ID (gpt-4, claude-3-opus, etc.) |
| `operation` | `string` | `"chat"` | Operation type (see ModelOperation) |
| `clientRequestId` | `string` | `undefined` | Your tracking ID |

#### Returns

The return value of `fn`.

#### Example

```typescript
const response = await trackLlmCall(
  { vendor: 'openai', model: 'gpt-4' },
  async (tracker) => {
    const response = await client.chat.completions.create(/* ... */);
    tracker.setTokens({
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    });
    tracker.setRequestId(response.id);
    return response;
  }
);
```

---

### LLMTracker

Tracker object for recording LLM call details.

#### Methods

##### setTokens()

```typescript
setTokens(tokens: {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): LLMTracker
```

Records token usage.

##### setRequestId()

```typescript
setRequestId(
  providerRequestId?: string,
  clientRequestId?: string,
): LLMTracker
```

Records request IDs for billing reconciliation.

##### setResponseModel()

```typescript
setResponseModel(model: string): LLMTracker
```

Records the actual model used in response.

##### setFinishReason()

```typescript
setFinishReason(reason: string): LLMTracker
```

Records the stop reason (stop, length, content_filter, etc.).

##### setStreaming()

```typescript
setStreaming(isStreaming?: boolean): LLMTracker
```

Marks request as streaming.

##### setCacheHit()

```typescript
setCacheHit(cacheHit?: boolean): LLMTracker
```

Marks as a cache hit.

##### setAttempt()

```typescript
setAttempt(attemptNumber: number): LLMTracker
```

Sets retry attempt number.

##### setRequestParams()

```typescript
setRequestParams(params: {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
}): LLMTracker
```

Records request parameters.

##### setError()

```typescript
setError(error: Error): LLMTracker
```

Records an error.

##### addMetadata()

```typescript
addMetadata(metadata: Record<string, any>): LLMTracker
```

Adds custom span attributes.

---

### trackToolCall()

Wrapper function for tracking tool/function calls.

```typescript
import { trackToolCall } from '@botanu/sdk';

trackToolCall<T>(
  options: {
    toolName: string;
    toolCallId?: string;
    provider?: string;
    [key: string]: any;
  },
  fn: (tracker: ToolTracker) => Promise<T>
): Promise<T>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `toolName` | `string` | Required | Name of the tool/function |
| `toolCallId` | `string` | `undefined` | Tool call ID from LLM response |
| `provider` | `string` | `undefined` | Tool provider if external |

---

### ModelOperation

Constants for operation types.

| Constant | Value |
|----------|-------|
| `CHAT` | `"chat"` |
| `TEXT_COMPLETION` | `"text_completion"` |
| `EMBEDDINGS` | `"embeddings"` |
| `GENERATE_CONTENT` | `"generate_content"` |
| `EXECUTE_TOOL` | `"execute_tool"` |
| `CREATE_AGENT` | `"create_agent"` |
| `INVOKE_AGENT` | `"invoke_agent"` |
| `RERANK` | `"rerank"` |
| `IMAGE_GENERATION` | `"image_generation"` |
| `SPEECH_TO_TEXT` | `"speech_to_text"` |
| `TEXT_TO_SPEECH` | `"text_to_speech"` |

---

## Data Tracking

### trackDbOperation()

Wrapper function for tracking database operations.

```typescript
import { trackDbOperation } from '@botanu/sdk';

trackDbOperation<T>(
  options: {
    system: string;
    operation: string;
    database?: string;
    [key: string]: any;
  },
  fn: (tracker: DBTracker) => Promise<T>
): Promise<T>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `system` | `string` | Required | Database system (postgresql, mongodb, etc.) |
| `operation` | `string` | Required | Operation type (SELECT, INSERT, etc.) |
| `database` | `string` | `undefined` | Database name |

#### Example

```typescript
const rows = await trackDbOperation(
  { system: 'postgresql', operation: 'SELECT' },
  async (db) => {
    const result = await cursor.execute(query);
    db.setResult({ rowsReturned: result.length });
    return result;
  }
);
```

---

### DBTracker

#### Methods

##### setResult()

```typescript
setResult(result: {
  rowsReturned?: number;
  rowsAffected?: number;
  bytesRead?: number;
  bytesWritten?: number;
}): DBTracker
```

##### setTable()

```typescript
setTable(tableName: string, schema?: string): DBTracker
```

##### setQueryId()

```typescript
setQueryId(queryId: string): DBTracker
```

##### setBytesScanned()

```typescript
setBytesScanned(bytesScanned: number): DBTracker
```

##### setError()

```typescript
setError(error: Error): DBTracker
```

##### addMetadata()

```typescript
addMetadata(metadata: Record<string, any>): DBTracker
```

---

### trackStorageOperation()

Wrapper function for tracking object storage operations.

```typescript
import { trackStorageOperation } from '@botanu/sdk';

trackStorageOperation<T>(
  options: {
    system: string;
    operation: string;
    [key: string]: any;
  },
  fn: (tracker: StorageTracker) => Promise<T>
): Promise<T>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `system` | `string` | Required | Storage system (s3, gcs, azure_blob, etc.) |
| `operation` | `string` | Required | Operation type (GET, PUT, DELETE, etc.) |

---

### StorageTracker

#### Methods

##### setResult()

```typescript
setResult(result: {
  objectsCount?: number;
  bytesRead?: number;
  bytesWritten?: number;
}): StorageTracker
```

##### setBucket()

```typescript
setBucket(bucket: string): StorageTracker
```

##### setError()

```typescript
setError(error: Error): StorageTracker
```

##### addMetadata()

```typescript
addMetadata(metadata: Record<string, any>): StorageTracker
```

---

### trackMessagingOperation()

Wrapper function for tracking messaging operations.

```typescript
import { trackMessagingOperation } from '@botanu/sdk';

trackMessagingOperation<T>(
  options: {
    system: string;
    operation: string;
    destination: string;
    [key: string]: any;
  },
  fn: (tracker: MessagingTracker) => Promise<T>
): Promise<T>
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `system` | `string` | Required | Messaging system (sqs, kafka, pubsub, etc.) |
| `operation` | `string` | Required | Operation type (publish, consume, etc.) |
| `destination` | `string` | Required | Queue/topic name |

---

### MessagingTracker

#### Methods

##### setResult()

```typescript
setResult(result: {
  messageCount?: number;
  bytesTransferred?: number;
}): MessagingTracker
```

##### setError()

```typescript
setError(error: Error): MessagingTracker
```

##### addMetadata()

```typescript
addMetadata(metadata: Record<string, any>): MessagingTracker
```

---

## Span Helpers

### emitOutcome()

Emit a business outcome for the current span.

```typescript
import { emitOutcome } from '@botanu/sdk';

emitOutcome(
  status: string,
  options?: {
    valueType?: string;
    valueAmount?: number;
    confidence?: number;
    reason?: string;
    errorType?: string;
    metadata?: Record<string, string>;
  }
): void
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | `string` | Required | Outcome status: `"success"`, `"partial"`, `"failed"`, `"timeout"`, `"canceled"`, `"abandoned"` |
| `valueType` | `string` | `undefined` | Type of business value achieved |
| `valueAmount` | `number` | `undefined` | Quantified value amount |
| `confidence` | `number` | `undefined` | Confidence score (0.0-1.0) |
| `reason` | `string` | `undefined` | Reason for the outcome |
| `errorType` | `string` | `undefined` | Error classification (e.g. `"TimeoutError"`) |
| `metadata` | `Record<string, string>` | `undefined` | Additional key-value metadata |

#### Example

```typescript
emitOutcome('success', { valueType: 'items_processed', valueAmount: 1 });
emitOutcome('failed', { errorType: 'TimeoutError', reason: 'LLM took >30s' });
```

---

### setBusinessContext()

Set business context attributes on the current span.

```typescript
import { setBusinessContext } from '@botanu/sdk';

setBusinessContext(context: {
  customerId?: string;
  team?: string;
  costCenter?: string;
  region?: string;
}): void
```

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `customerId` | `string` | `undefined` | Customer identifier |
| `team` | `string` | `undefined` | Team or department |
| `costCenter` | `string` | `undefined` | Cost center for financial tracking |
| `region` | `string` | `undefined` | Geographic region |

---

## Context Helpers

### getRunId()

Get the current run ID from baggage.

```typescript
import { getRunId } from '@botanu/sdk';

const runId = getRunId();
```

### getWorkflow()

Get the current workflow name from baggage.

```typescript
import { getWorkflow } from '@botanu/sdk';

const workflow = getWorkflow();
```

### getBaggage()

Get a baggage value by key.

```typescript
import { getBaggage } from '@botanu/sdk';

const value = getBaggage('botanu.tenant_id');
```

### setBaggage()

Set a baggage value. Returns a new `Context` -- use with `context.with()`.

```typescript
import { setBaggage } from '@botanu/sdk';
import { context } from '@opentelemetry/api';

const ctx = setBaggage('botanu.custom_field', 'my_value');
context.with(ctx, () => {
  // baggage is available in this scope
});
```

### getCurrentSpan()

Get the current active span.

```typescript
import { getCurrentSpan } from '@botanu/sdk';

const span = getCurrentSpan();
span?.setAttribute('custom.attribute', 'value');
```

### injectBotanuContext()

Inject current Botanu context into a carrier object for message queue propagation.

```typescript
import { injectBotanuContext } from '@botanu/sdk';

const carrier = injectBotanuContext();
// carrier contains: { "botanu.run_id": "...", "botanu.workflow": "...", ... }
```

### extractBotanuCarrier()

Extract Botanu context from a carrier object.

```typescript
import { extractBotanuCarrier } from '@botanu/sdk';

const ctx = extractBotanuCarrier(carrier);
// ctx is a RunContext or null if required fields are missing
```

## See Also

- [LLM Tracking](../tracking/llm-tracking.md) - Detailed LLM tracking guide
- [Data Tracking](../tracking/data-tracking.md) - Data operation tracking
- [Outcomes](../tracking/outcomes.md) - Outcome recording
