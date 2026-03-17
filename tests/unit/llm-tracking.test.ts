import { describe, it, expect } from 'vitest';
import {
  LLMTracker,
  ToolTracker,
  LLM_VENDORS,
  ModelOperation,
  GenAIAttributes,
  BotanuAttributes,
} from '../../src/tracking/llm.js';

describe('LLM_VENDORS', () => {
  it('should normalize vendor names', () => {
    expect(LLM_VENDORS['openai']).toBe('openai');
    expect(LLM_VENDORS['anthropic']).toBe('anthropic');
    expect(LLM_VENDORS['claude']).toBe('anthropic');
    expect(LLM_VENDORS['azure_openai']).toBe('azure.openai');
    expect(LLM_VENDORS['azure-openai']).toBe('azure.openai');
    expect(LLM_VENDORS['bedrock']).toBe('aws.bedrock');
    expect(LLM_VENDORS['aws_bedrock']).toBe('aws.bedrock');
    expect(LLM_VENDORS['vertex']).toBe('gcp.vertex_ai');
    expect(LLM_VENDORS['vertexai']).toBe('gcp.vertex_ai');
    expect(LLM_VENDORS['gemini']).toBe('gcp.vertex_ai');
    expect(LLM_VENDORS['cohere']).toBe('cohere');
    expect(LLM_VENDORS['mistral']).toBe('mistral');
    expect(LLM_VENDORS['groq']).toBe('groq');
    expect(LLM_VENDORS['ollama']).toBe('ollama');
    expect(LLM_VENDORS['huggingface']).toBe('huggingface');
    expect(LLM_VENDORS['hf']).toBe('huggingface');
    expect(LLM_VENDORS['fireworks']).toBe('fireworks');
    expect(LLM_VENDORS['perplexity']).toBe('perplexity');
    expect(LLM_VENDORS['replicate']).toBe('replicate');
    expect(LLM_VENDORS['together']).toBe('together');
    expect(LLM_VENDORS['togetherai']).toBe('together');
  });
});

describe('ModelOperation', () => {
  it('should have all operation types', () => {
    expect(ModelOperation.CHAT).toBe('chat');
    expect(ModelOperation.TEXT_COMPLETION).toBe('text_completion');
    expect(ModelOperation.EMBEDDINGS).toBe('embeddings');
    expect(ModelOperation.EXECUTE_TOOL).toBe('execute_tool');
    expect(ModelOperation.IMAGE_GENERATION).toBe('image_generation');
    expect(ModelOperation.SPEECH_TO_TEXT).toBe('speech_to_text');
    expect(ModelOperation.TEXT_TO_SPEECH).toBe('text_to_speech');
  });

  it('should have aliases', () => {
    expect(ModelOperation.COMPLETION).toBe(ModelOperation.TEXT_COMPLETION);
    expect(ModelOperation.EMBEDDING).toBe(ModelOperation.EMBEDDINGS);
    expect(ModelOperation.FUNCTION_CALL).toBe(ModelOperation.EXECUTE_TOOL);
    expect(ModelOperation.TOOL_USE).toBe(ModelOperation.EXECUTE_TOOL);
  });
});

describe('GenAIAttributes', () => {
  it('should have OTel GenAI attribute keys', () => {
    expect(GenAIAttributes.OPERATION_NAME).toBe('gen_ai.operation.name');
    expect(GenAIAttributes.PROVIDER_NAME).toBe('gen_ai.provider.name');
    expect(GenAIAttributes.REQUEST_MODEL).toBe('gen_ai.request.model');
    expect(GenAIAttributes.RESPONSE_MODEL).toBe('gen_ai.response.model');
    expect(GenAIAttributes.USAGE_INPUT_TOKENS).toBe('gen_ai.usage.input_tokens');
    expect(GenAIAttributes.USAGE_OUTPUT_TOKENS).toBe('gen_ai.usage.output_tokens');
    expect(GenAIAttributes.RESPONSE_ID).toBe('gen_ai.response.id');
    expect(GenAIAttributes.TOOL_NAME).toBe('gen_ai.tool.name');
    expect(GenAIAttributes.TOOL_CALL_ID).toBe('gen_ai.tool.call.id');
    expect(GenAIAttributes.ERROR_TYPE).toBe('error.type');
  });
});

describe('BotanuAttributes', () => {
  it('should have Botanu-specific attribute keys', () => {
    expect(BotanuAttributes.VENDOR).toBe('botanu.vendor');
    expect(BotanuAttributes.VENDOR_REQUEST_ID).toBe('botanu.vendor.request_id');
    expect(BotanuAttributes.TOKENS_CACHED).toBe('botanu.usage.cached_tokens');
    expect(BotanuAttributes.STREAMING).toBe('botanu.request.streaming');
    expect(BotanuAttributes.CACHE_HIT).toBe('botanu.request.cache_hit');
    expect(BotanuAttributes.ATTEMPT_NUMBER).toBe('botanu.request.attempt');
    expect(BotanuAttributes.TOOL_SUCCESS).toBe('botanu.tool.success');
    expect(BotanuAttributes.TOOL_DURATION_MS).toBe('botanu.tool.duration_ms');
  });
});

describe('LLMTracker', () => {
  it('should create with vendor, model, and operation', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');

    expect(tracker.vendor).toBe('openai');
    expect(tracker.model).toBe('gpt-4');
    expect(tracker.operation).toBe('chat');
    expect(tracker.inputTokens).toBe(0);
    expect(tracker.outputTokens).toBe(0);
    expect(tracker.isStreaming).toBe(false);
    expect(tracker.attemptNumber).toBe(1);
  });

  it('should set tokens without span', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    tracker.setTokens(100, 50);

    expect(tracker.inputTokens).toBe(100);
    expect(tracker.outputTokens).toBe(50);
  });

  it('should set cached tokens', () => {
    const tracker = new LLMTracker('anthropic', 'claude-3', 'chat');
    tracker.setTokens(100, 50, { cacheReadTokens: 30, cacheWriteTokens: 10 });

    expect(tracker.cachedTokens).toBe(30);
    expect(tracker.cacheReadTokens).toBe(30);
    expect(tracker.cacheWriteTokens).toBe(10);
  });

  it('should set request IDs', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    tracker.setRequestId('resp-123', 'client-456');

    expect(tracker.vendorRequestId).toBe('resp-123');
    expect(tracker.clientRequestId).toBe('client-456');
  });

  it('should set response model', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    tracker.setResponseModel('gpt-4-0613');

    expect(tracker.responseModel).toBe('gpt-4-0613');
  });

  it('should set streaming', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    tracker.setStreaming(true);

    expect(tracker.isStreaming).toBe(true);
  });

  it('should set cache hit', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    tracker.setCacheHit(true);

    expect(tracker.cacheHit).toBe(true);
  });

  it('should set attempt number', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    tracker.setAttempt(3);

    expect(tracker.attemptNumber).toBe(3);
  });

  it('should set error', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    tracker.setError(new TypeError('Connection failed'));

    expect(tracker.errorType).toBe('TypeError');
  });

  it('should chain methods fluently', () => {
    const tracker = new LLMTracker('openai', 'gpt-4', 'chat');
    const result = tracker
      .setTokens(100, 50)
      .setRequestId('resp-123')
      .setStreaming(true)
      .setAttempt(2);

    expect(result).toBe(tracker);
    expect(tracker.inputTokens).toBe(100);
    expect(tracker.vendorRequestId).toBe('resp-123');
    expect(tracker.isStreaming).toBe(true);
    expect(tracker.attemptNumber).toBe(2);
  });
});

describe('ToolTracker', () => {
  it('should create with tool name', () => {
    const tracker = new ToolTracker('search');

    expect(tracker.toolName).toBe('search');
    expect(tracker.success).toBe(true);
    expect(tracker.itemsReturned).toBe(0);
    expect(tracker.bytesProcessed).toBe(0);
  });

  it('should set result', () => {
    const tracker = new ToolTracker('search');
    tracker.setResult({ success: true, itemsReturned: 10, bytesProcessed: 1024 });

    expect(tracker.success).toBe(true);
    expect(tracker.itemsReturned).toBe(10);
    expect(tracker.bytesProcessed).toBe(1024);
  });

  it('should set error', () => {
    const tracker = new ToolTracker('search');
    tracker.setError(new Error('Not found'));

    expect(tracker.success).toBe(false);
    expect(tracker.errorType).toBe('Error');
  });

  it('should set tool call ID', () => {
    const tracker = new ToolTracker('search');
    tracker.setToolCallId('call-123');

    expect(tracker.toolCallId).toBe('call-123');
  });

  it('should chain methods fluently', () => {
    const tracker = new ToolTracker('search');
    const result = tracker
      .setResult({ itemsReturned: 5 })
      .setToolCallId('call-123');

    expect(result).toBe(tracker);
  });
});
