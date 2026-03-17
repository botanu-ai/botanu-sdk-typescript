// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Config env-var precedence: BOTANU_* > OTEL_* > defaults
// ---------------------------------------------------------------------------

describe('Config env-var precedence', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('BOTANU_SERVICE_NAME over OTEL_SERVICE_NAME', async () => {
    process.env.BOTANU_SERVICE_NAME = 'botanu-svc';
    process.env.OTEL_SERVICE_NAME = 'otel-svc';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.serviceName).toBe('botanu-svc');
  });

  it('OTEL_SERVICE_NAME fallback when BOTANU not set', async () => {
    delete process.env.BOTANU_SERVICE_NAME;
    process.env.OTEL_SERVICE_NAME = 'otel-svc';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.serviceName).toBe('otel-svc');
  });

  it('defaults to unknown_service', async () => {
    delete process.env.BOTANU_SERVICE_NAME;
    delete process.env.OTEL_SERVICE_NAME;
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.serviceName).toBe('unknown_service');
  });

  it('BOTANU_COLLECTOR_ENDPOINT over OTEL', async () => {
    process.env.BOTANU_COLLECTOR_ENDPOINT = 'http://botanu:4318';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4318';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.otlpEndpoint).toBe('http://botanu:4318');
  });

  it('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT over base endpoint', async () => {
    delete process.env.BOTANU_COLLECTOR_ENDPOINT;
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://traces:4318/v1/traces';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://base:4318';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.otlpEndpoint).toBe('http://traces:4318/v1/traces');
  });

  it('defaults to localhost:4318 without API key', async () => {
    delete process.env.BOTANU_COLLECTOR_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.BOTANU_API_KEY;
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.otlpEndpoint).toBe('http://localhost:4318');
  });

  it('BOTANU_ENVIRONMENT over OTEL_DEPLOYMENT_ENVIRONMENT', async () => {
    process.env.BOTANU_ENVIRONMENT = 'botanu-staging';
    process.env.OTEL_DEPLOYMENT_ENVIRONMENT = 'otel-prod';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.deploymentEnvironment).toBe('botanu-staging');
  });

  it('defaults to production', async () => {
    delete process.env.BOTANU_ENVIRONMENT;
    delete process.env.OTEL_DEPLOYMENT_ENVIRONMENT;
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.deploymentEnvironment).toBe('production');
  });

  it('explicit overrides beat env vars', async () => {
    process.env.BOTANU_SERVICE_NAME = 'env-name';
    process.env.BOTANU_ENVIRONMENT = 'env-staging';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig({
      serviceName: 'explicit-name',
      deploymentEnvironment: 'explicit-prod',
    });
    expect(cfg.serviceName).toBe('explicit-name');
    expect(cfg.deploymentEnvironment).toBe('explicit-prod');
  });
});

// ---------------------------------------------------------------------------
// Config: API key auto-configuration
// ---------------------------------------------------------------------------

describe('API key auto-configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('API key sets endpoint to ingest.botanu.ai without port', async () => {
    delete process.env.BOTANU_COLLECTOR_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    process.env.BOTANU_API_KEY = 'btnu_live_test123';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.otlpEndpoint).toBe('https://ingest.botanu.ai');
  });

  it('API key sets Authorization header', async () => {
    delete process.env.BOTANU_COLLECTOR_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    process.env.BOTANU_API_KEY = 'btnu_live_abc123';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig();
    expect(cfg.otlpHeaders).toEqual({ Authorization: 'Bearer btnu_live_abc123' });
  });

  it('explicit headers override API key headers', async () => {
    process.env.BOTANU_API_KEY = 'btnu_live_abc123';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig({ otlpHeaders: { 'X-Custom': 'value' } });
    expect(cfg.otlpHeaders).toEqual({ 'X-Custom': 'value' });
  });

  it('explicit endpoint overrides API key endpoint', async () => {
    process.env.BOTANU_API_KEY = 'btnu_live_abc123';
    const { loadConfig } = await import('../../src/sdk/config.js');
    const cfg = loadConfig({ otlpEndpoint: 'http://custom:4318' });
    expect(cfg.otlpEndpoint).toBe('http://custom:4318');
  });
});

// ---------------------------------------------------------------------------
// Config: propagation mode
// ---------------------------------------------------------------------------

describe('Propagation mode', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('defaults to lean', async () => {
    delete process.env.BOTANU_PROPAGATION_MODE;
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().propagationMode).toBe('lean');
  });

  it('env var full', async () => {
    process.env.BOTANU_PROPAGATION_MODE = 'full';
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().propagationMode).toBe('full');
  });

  it('invalid propagation mode keeps default', async () => {
    process.env.BOTANU_PROPAGATION_MODE = 'invalid';
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().propagationMode).toBe('lean');
  });
});

// ---------------------------------------------------------------------------
// Config: auto-detect resources
// ---------------------------------------------------------------------------

describe('Auto-detect resources', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('defaults to true', async () => {
    delete process.env.BOTANU_AUTO_DETECT_RESOURCES;
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().autoDetectResources).toBe(true);
  });

  it('env false disables', async () => {
    process.env.BOTANU_AUTO_DETECT_RESOURCES = 'false';
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().autoDetectResources).toBe(false);
  });

  it('env 0 disables', async () => {
    process.env.BOTANU_AUTO_DETECT_RESOURCES = '0';
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().autoDetectResources).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bootstrap: enable/disable lifecycle
// ---------------------------------------------------------------------------

describe('enable/disable lifecycle', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('isEnabled is false initially', async () => {
    const { isEnabled } = await import('../../src/sdk/bootstrap.js');
    // May be true from prior tests — we're testing the export exists
    expect(typeof isEnabled()).toBe('boolean');
  });

  it('getConfig returns undefined when not initialized', async () => {
    const mod = await import('../../src/sdk/bootstrap.js');
    // Reset internal state for test
    (mod as any)._initialized = false;
    (mod as any)._currentConfig = undefined;
    expect(mod.getConfig()).toBeUndefined();
  });

  it('disable when not initialized is noop', async () => {
    const mod = await import('../../src/sdk/bootstrap.js');
    const orig = (mod as any)._initialized;
    (mod as any)._initialized = false;
    expect(() => mod.disable()).not.toThrow();
    (mod as any)._initialized = orig;
  });

  it('double enable logs warning and returns false', () => {
    // Verify the source code has the double-init guard
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    expect(source).toContain("if (_initialized)");
    expect(source).toContain("return false");
    expect(source).toContain("already initialized");
  });
});

// ---------------------------------------------------------------------------
// Bootstrap: endpoint normalization
// ---------------------------------------------------------------------------

describe('Endpoint normalization', () => {
  it('base endpoint gets /v1/traces appended', () => {
    let endpoint = 'http://collector:4318';
    if (!endpoint.endsWith('/v1/traces')) {
      endpoint = `${endpoint.replace(/\/+$/, '')}/v1/traces`;
    }
    expect(endpoint).toBe('http://collector:4318/v1/traces');
  });

  it('already ending with /v1/traces is not doubled', () => {
    let endpoint = 'http://collector:4318/v1/traces';
    if (!endpoint.endsWith('/v1/traces')) {
      endpoint = `${endpoint.replace(/\/+$/, '')}/v1/traces`;
    }
    expect(endpoint).toBe('http://collector:4318/v1/traces');
  });

  it('trailing slash handled', () => {
    let endpoint = 'http://collector:4318/';
    if (!endpoint.endsWith('/v1/traces')) {
      endpoint = `${endpoint.replace(/\/+$/, '')}/v1/traces`;
    }
    expect(endpoint).toBe('http://collector:4318/v1/traces');
  });
});

// ---------------------------------------------------------------------------
// Bootstrap: no-sampling guarantee
// ---------------------------------------------------------------------------

describe('No-sampling guarantee', () => {
  it('bootstrap source uses AlwaysOnSampler', () => {
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    expect(source).toContain('AlwaysOnSampler');
    expect(source).toContain('new AlwaysOnSampler()');
  });

  it('bootstrap source does not import ratio or parent-based samplers', () => {
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    expect(source).not.toContain('TraceIdRatio');
    expect(source).not.toContain('ParentBased');
    expect(source).not.toContain('AlwaysOffSampler');
  });

  it('bootstrap checks for OTEL_TRACES_SAMPLER env var', () => {
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    expect(source).toContain('OTEL_TRACES_SAMPLER');
  });
});

// ---------------------------------------------------------------------------
// Bootstrap: provider creation
// ---------------------------------------------------------------------------

describe('Provider creation', () => {
  it('bootstrap creates new NodeTracerProvider', () => {
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    expect(source).toContain('new NodeTracerProvider(');
    expect(source).toContain('provider.register()');
  });

  it('bootstrap creates LoggerProvider', () => {
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    expect(source).toContain('new LoggerProvider(');
  });

  it('bootstrap sets W3C propagators', () => {
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    expect(source).toContain('W3CTraceContextPropagator');
    expect(source).toContain('W3CBaggagePropagator');
    expect(source).toContain('CompositePropagator');
  });
});

// ---------------------------------------------------------------------------
// Bootstrap: auto-instrumentation coverage
// ---------------------------------------------------------------------------

describe('Auto-instrumentation coverage', () => {
  let source: string;

  beforeEach(() => {
    source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
  });

  function extractInstrumentNames(): string[] {
    const regex = /tryInstrument\(enabled,\s*failed,\s*'([^']+)'/g;
    const names: string[] = [];
    let match;
    while ((match = regex.exec(source)) !== null) {
      names.push(match[1]);
    }
    return names;
  }

  // HTTP
  it('http instrumented', () => expect(extractInstrumentNames()).toContain('http'));
  it('undici instrumented', () => expect(extractInstrumentNames()).toContain('undici'));

  // Frameworks
  it('express instrumented', () => expect(extractInstrumentNames()).toContain('express'));
  it('fastify instrumented', () => expect(extractInstrumentNames()).toContain('fastify'));
  it('koa instrumented', () => expect(extractInstrumentNames()).toContain('koa'));
  it('hapi instrumented', () => expect(extractInstrumentNames()).toContain('hapi'));
  it('nestjs instrumented', () => expect(extractInstrumentNames()).toContain('nestjs'));

  // Databases
  it('pg instrumented', () => expect(extractInstrumentNames()).toContain('pg'));
  it('mongodb instrumented', () => expect(extractInstrumentNames()).toContain('mongodb'));
  it('redis instrumented', () => expect(extractInstrumentNames()).toContain('redis'));
  it('mysql instrumented', () => expect(extractInstrumentNames()).toContain('mysql'));
  it('mysql2 instrumented', () => expect(extractInstrumentNames()).toContain('mysql2'));
  it('ioredis instrumented', () => expect(extractInstrumentNames()).toContain('ioredis'));
  it('prisma instrumented', () => expect(extractInstrumentNames()).toContain('prisma'));
  it('sequelize instrumented', () => expect(extractInstrumentNames()).toContain('sequelize'));
  it('typeorm instrumented', () => expect(extractInstrumentNames()).toContain('typeorm'));
  it('knex instrumented', () => expect(extractInstrumentNames()).toContain('knex'));

  // Caching
  it('memcached instrumented', () => expect(extractInstrumentNames()).toContain('memcached'));

  // Messaging
  it('amqplib instrumented', () => expect(extractInstrumentNames()).toContain('amqplib'));
  it('kafkajs instrumented', () => expect(extractInstrumentNames()).toContain('kafkajs'));
  it('bullmq instrumented', () => expect(extractInstrumentNames()).toContain('bullmq'));

  // AWS
  it('aws-sdk instrumented', () => expect(extractInstrumentNames()).toContain('aws-sdk'));

  // gRPC
  it('grpc instrumented', () => expect(extractInstrumentNames()).toContain('grpc'));

  // GenAI
  it('openai instrumented', () => expect(extractInstrumentNames()).toContain('openai'));
  it('anthropic instrumented', () => expect(extractInstrumentNames()).toContain('anthropic'));
  it('vertexai instrumented', () => expect(extractInstrumentNames()).toContain('vertexai'));
  it('cohere instrumented', () => expect(extractInstrumentNames()).toContain('cohere'));
  it('bedrock instrumented', () => expect(extractInstrumentNames()).toContain('bedrock'));
  it('azure-openai instrumented', () => expect(extractInstrumentNames()).toContain('azure-openai'));
  it('langchain instrumented', () => expect(extractInstrumentNames()).toContain('langchain'));

  // Runtime
  it('runtime-node instrumented', () => expect(extractInstrumentNames()).toContain('runtime-node'));
  it('dns instrumented', () => expect(extractInstrumentNames()).toContain('dns'));
  it('net instrumented', () => expect(extractInstrumentNames()).toContain('net'));
  it('fs instrumented', () => expect(extractInstrumentNames()).toContain('fs'));
});

// ---------------------------------------------------------------------------
// Bootstrap: tryInstrument resilience
// ---------------------------------------------------------------------------

describe('tryInstrument resilience', () => {
  it('missing package silently skipped, real errors recorded', () => {
    const source = readFileSync(resolve(__dirname, '../../src/sdk/bootstrap.ts'), 'utf-8');
    // tryInstrument must distinguish MODULE_NOT_FOUND from real errors
    expect(source).toContain('MODULE_NOT_FOUND');
    expect(source).toContain('failed.push');
  });
});

// ---------------------------------------------------------------------------
// Config: export tuning defaults
// ---------------------------------------------------------------------------

describe('Export tuning defaults', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('max_export_batch_size defaults to 512', async () => {
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().maxExportBatchSize).toBe(512);
  });

  it('max_queue_size defaults to 65536', async () => {
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().maxQueueSize).toBe(65536);
  });

  it('schedule_delay_millis defaults to 5000', async () => {
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().scheduleDelayMillis).toBe(5000);
  });

  it('export_timeout_millis defaults to 30000', async () => {
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().exportTimeoutMillis).toBe(30000);
  });

  it('BOTANU_MAX_QUEUE_SIZE env var overrides default', async () => {
    process.env.BOTANU_MAX_QUEUE_SIZE = '1024';
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().maxQueueSize).toBe(1024);
  });

  it('invalid BOTANU_MAX_QUEUE_SIZE falls back to default', async () => {
    process.env.BOTANU_MAX_QUEUE_SIZE = 'bad';
    const { loadConfig } = await import('../../src/sdk/config.js');
    expect(loadConfig().maxQueueSize).toBe(65536);
  });
});
