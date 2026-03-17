// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Botanu Bootstrap — one-switch enablement for OTEL auto-instrumentation.
 *
 * This is the "Botanu OTel Distribution" — a curated bundle that:
 *
 * 1. Configures OTEL SDK with OTLP exporter
 * 2. Enables OTEL auto-instrumentation for popular libraries
 * 3. Adds RunContextEnricher (propagates run_id to all spans)
 * 4. Sets up W3C TraceContext + Baggage propagators
 *
 * Usage:
 *   import { enable } from '@botanu/sdk';
 *   enable(); // reads config from env vars
 */

import {
  type TextMapPropagator,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { BotanuConfig } from './config.js';

let _initialized = false;
let _currentConfig: BotanuConfig | undefined;

export interface EnableOptions {
  serviceName?: string;
  otlpEndpoint?: string;
  environment?: string;
  autoInstrumentation?: boolean;
  logLevel?: string;
  config?: BotanuConfig;
  configFile?: string;
}

export function enable(options: EnableOptions = {}): boolean {
  if (_initialized) {
    console.warn('Botanu SDK already initialized');
    return false;
  }

  const { loadConfig } = require('./config.js') as typeof import('./config.js');

  let cfg: BotanuConfig;
  if (options.config) {
    cfg = options.config;
  } else {
    cfg = loadConfig({ configFile: options.configFile });
  }

  if (options.serviceName) cfg = { ...cfg, serviceName: options.serviceName };
  if (options.otlpEndpoint) cfg = { ...cfg, otlpEndpoint: options.otlpEndpoint };
  if (options.environment) cfg = { ...cfg, deploymentEnvironment: options.environment };

  _currentConfig = cfg;

  let tracesEndpoint = cfg.otlpEndpoint;
  if (tracesEndpoint && !tracesEndpoint.endsWith('/v1/traces')) {
    tracesEndpoint = `${tracesEndpoint.replace(/\/+$/, '')}/v1/traces`;
  }

  const otelSamplerEnv = process.env.OTEL_TRACES_SAMPLER;
  if (otelSamplerEnv && otelSamplerEnv !== 'always_on') {
    console.warn(
      `OTEL_TRACES_SAMPLER=${otelSamplerEnv} is set but Botanu enforces ALWAYS_ON. No spans will be sampled or dropped.`,
    );
  }

  console.info(
    `Initializing Botanu SDK: service=${cfg.serviceName}, env=${cfg.deploymentEnvironment}, endpoint=${tracesEndpoint}`,
  );

  try {
    const { Resource } = require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');
    const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node') as typeof import('@opentelemetry/sdk-trace-node');
    const { BatchSpanProcessor, AlwaysOnSampler } = require('@opentelemetry/sdk-trace-base') as typeof import('@opentelemetry/sdk-trace-base');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    const { W3CTraceContextPropagator, CompositePropagator, W3CBaggagePropagator } = require('@opentelemetry/core') as typeof import('@opentelemetry/core');
    const { RunContextEnricher } = require('../processors/enricher.js') as typeof import('../processors/enricher.js');

    // Build resource attributes
    const resourceAttrs: Record<string, string> = {
      'service.name': cfg.serviceName,
      'deployment.environment': cfg.deploymentEnvironment,
      'telemetry.sdk.name': 'botanu',
      'telemetry.sdk.version': '0.1.0',
    };
    if (cfg.serviceVersion) resourceAttrs['service.version'] = cfg.serviceVersion;
    if (cfg.serviceNamespace) resourceAttrs['service.namespace'] = cfg.serviceNamespace;

    // Auto-detect resources
    if (cfg.autoDetectResources) {
      try {
        const { detectResourceAttrs } = require('../resources/index.js') as typeof import('../resources/index.js');
        const detected = detectResourceAttrs();
        for (const [key, value] of Object.entries(detected)) {
          if (!(key in resourceAttrs)) {
            resourceAttrs[key] = String(value);
          }
        }
      } catch {
        // Resource detection is optional
      }
    }

    const resource = new Resource(resourceAttrs);

    const provider = new NodeTracerProvider({
      resource,
      sampler: new AlwaysOnSampler(),
    });

    // Add RunContextEnricher span processor
    const leanMode = cfg.propagationMode === 'lean';
    provider.addSpanProcessor(new RunContextEnricher(leanMode));

    // Add OTLP exporter
    const exporter = new OTLPTraceExporter({
      url: tracesEndpoint,
      headers: cfg.otlpHeaders ?? {},
    });
    provider.addSpanProcessor(
      new BatchSpanProcessor(exporter, {
        maxExportBatchSize: cfg.maxExportBatchSize,
        maxQueueSize: cfg.maxQueueSize,
        scheduledDelayMillis: cfg.scheduleDelayMillis,
        exportTimeoutMillis: cfg.exportTimeoutMillis,
      }),
    );

    // Set propagators
    propagation.setGlobalPropagator(
      new CompositePropagator({
        propagators: [
          new W3CTraceContextPropagator(),
          new W3CBaggagePropagator(),
        ] as TextMapPropagator[],
      }),
    );

    provider.register();
    console.info('Botanu SDK tracing initialized');

    // Set up LoggerProvider for outcome event emission
    try {
      const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
      const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');

      let logsEndpoint = cfg.otlpEndpoint;
      if (logsEndpoint && !logsEndpoint.endsWith('/v1/logs')) {
        logsEndpoint = `${logsEndpoint.replace(/\/+$/, '')}/v1/logs`;
      }

      const logProvider = new LoggerProvider({ resource });
      const logExporter = new OTLPLogExporter({
        url: logsEndpoint,
        headers: cfg.otlpHeaders ?? {},
      });
      logProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));

      try {
        const apiLogs = require('@opentelemetry/api-logs');
        apiLogs.logs.setGlobalLoggerProvider(logProvider);
        console.info('Botanu SDK log provider initialized');
      } catch {
        // api-logs not available
      }
    } catch {
      // Log exporter not available; outcome log emission disabled
    }

    // Auto-instrumentation
    if (options.autoInstrumentation !== false) {
      enableAutoInstrumentation();
    }

    _initialized = true;
    return true;
  } catch (err) {
    const error = err as { code?: string };
    if (error?.code === 'MODULE_NOT_FOUND') {
      console.error(
        'Botanu SDK: missing required OpenTelemetry packages.\n' +
          'Install with: npm install @opentelemetry/sdk-trace-node @opentelemetry/sdk-trace-base ' +
          '@opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/core',
      );
    } else {
      console.error('Botanu SDK: failed to initialize:', err);
    }
    return false;
  }
}

function enableAutoInstrumentation(): void {
  const enabled: string[] = [];
  const failed: Array<[string, string]> = [];

  // HTTP
  tryInstrument(enabled, failed, 'http', '@opentelemetry/instrumentation-http', 'HttpInstrumentation');
  tryInstrument(enabled, failed, 'undici', '@opentelemetry/instrumentation-undici', 'UndiciInstrumentation');

  // Web frameworks
  tryInstrument(enabled, failed, 'express', '@opentelemetry/instrumentation-express', 'ExpressInstrumentation');
  tryInstrument(enabled, failed, 'fastify', '@opentelemetry/instrumentation-fastify', 'FastifyInstrumentation');
  tryInstrument(enabled, failed, 'koa', '@opentelemetry/instrumentation-koa', 'KoaInstrumentation');
  tryInstrument(enabled, failed, 'hapi', '@opentelemetry/instrumentation-hapi', 'HapiInstrumentation');
  tryInstrument(enabled, failed, 'nestjs', '@opentelemetry/instrumentation-nestjs-core', 'NestInstrumentation');

  // Databases
  tryInstrument(enabled, failed, 'pg', '@opentelemetry/instrumentation-pg', 'PgInstrumentation');
  tryInstrument(enabled, failed, 'mongodb', '@opentelemetry/instrumentation-mongodb', 'MongoDBInstrumentation');
  tryInstrument(enabled, failed, 'redis', '@opentelemetry/instrumentation-redis-4', 'RedisInstrumentation');
  tryInstrument(enabled, failed, 'mysql', '@opentelemetry/instrumentation-mysql', 'MySQLInstrumentation');
  tryInstrument(enabled, failed, 'mysql2', '@opentelemetry/instrumentation-mysql2', 'MySQL2Instrumentation');
  tryInstrument(enabled, failed, 'knex', '@opentelemetry/instrumentation-knex', 'KnexInstrumentation');
  tryInstrument(enabled, failed, 'typeorm', '@opentelemetry/instrumentation-typeorm', 'TypeormInstrumentation');
  tryInstrument(enabled, failed, 'sequelize', '@opentelemetry/instrumentation-sequelize', 'SequelizeInstrumentation');
  tryInstrument(enabled, failed, 'prisma', '@opentelemetry/instrumentation-prisma', 'PrismaInstrumentation');
  tryInstrument(enabled, failed, 'ioredis', '@opentelemetry/instrumentation-ioredis', 'IORedisInstrumentation');

  // Caching
  tryInstrument(enabled, failed, 'memcached', '@opentelemetry/instrumentation-memcached', 'MemcachedInstrumentation');

  // Messaging
  tryInstrument(enabled, failed, 'amqplib', '@opentelemetry/instrumentation-amqplib', 'AmqplibInstrumentation');
  tryInstrument(enabled, failed, 'kafkajs', '@opentelemetry/instrumentation-kafkajs', 'KafkaJsInstrumentation');
  tryInstrument(enabled, failed, 'bullmq', '@opentelemetry/instrumentation-bullmq', 'BullMQInstrumentation');

  // AWS
  tryInstrument(enabled, failed, 'aws-sdk', '@opentelemetry/instrumentation-aws-sdk', 'AwsInstrumentation');

  // gRPC
  tryInstrument(enabled, failed, 'grpc', '@opentelemetry/instrumentation-grpc', 'GrpcInstrumentation');

  // Runtime / Node.js internals
  tryInstrument(enabled, failed, 'runtime-node', '@opentelemetry/instrumentation-runtime-node', 'RuntimeNodeInstrumentation');
  tryInstrument(enabled, failed, 'dns', '@opentelemetry/instrumentation-dns', 'DnsInstrumentation');
  tryInstrument(enabled, failed, 'net', '@opentelemetry/instrumentation-net', 'NetInstrumentation');
  tryInstrument(enabled, failed, 'fs', '@opentelemetry/instrumentation-fs', 'FsInstrumentation');

  // GenAI / AI — mirrors Python SDK coverage + JS-ecosystem additions
  // Official OTel
  tryInstrument(enabled, failed, 'openai', '@opentelemetry/instrumentation-openai', 'OpenAIInstrumentation');
  // Traceloop OpenLLMetry (community standard for JS GenAI instrumentation)
  tryInstrument(enabled, failed, 'anthropic', '@traceloop/instrumentation-anthropic', 'AnthropicInstrumentation');
  tryInstrument(enabled, failed, 'vertexai', '@traceloop/instrumentation-vertexai', 'VertexAIInstrumentation');
  tryInstrument(enabled, failed, 'cohere', '@traceloop/instrumentation-cohere', 'CohereInstrumentation');
  tryInstrument(enabled, failed, 'bedrock', '@traceloop/instrumentation-bedrock', 'BedrockInstrumentation');
  tryInstrument(enabled, failed, 'azure-openai', '@traceloop/instrumentation-azure', 'AzureOpenAIInstrumentation');
  tryInstrument(enabled, failed, 'langchain', '@traceloop/instrumentation-langchain', 'LangChainInstrumentation');

  if (enabled.length > 0) {
    console.info(`Auto-instrumentation enabled: ${enabled.join(', ')}`);
  }
  for (const [name, error] of failed) {
    console.warn(`Auto-instrumentation failed for ${name}: ${error}`);
  }
}

function tryInstrument(
  enabled: string[],
  failed: Array<[string, string]>,
  name: string,
  modulePath: string,
  className: string,
): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(modulePath);
    const InstrumentorClass = mod[className];
    if (InstrumentorClass) {
      const instrumentor = new InstrumentorClass();
      instrumentor.enable?.() ?? instrumentor.instrument?.();
      enabled.push(name);
    }
  } catch (err) {
    // ImportError (MODULE_NOT_FOUND) = package not installed → silently skip
    // Any other error = instrumentation bug → record for user visibility
    const error = err as { code?: string };
    if (error?.code !== 'MODULE_NOT_FOUND') {
      failed.push([name, String(err)]);
    }
  }
}

export function isEnabled(): boolean {
  return _initialized;
}

export function getConfig(): BotanuConfig | undefined {
  return _currentConfig;
}

export function disable(): void {
  if (!_initialized) return;

  try {
    const provider = trace.getTracerProvider();
    if ('forceFlush' in provider) {
      (provider as { forceFlush: (timeout?: number) => Promise<void> }).forceFlush(5000);
    }
    if ('shutdown' in provider) {
      (provider as { shutdown: () => Promise<void> }).shutdown();
    }

    // Flush LoggerProvider
    try {
      const apiLogs = require('@opentelemetry/api-logs');
      const logProvider = apiLogs.logs.getLoggerProvider();
      if (logProvider?.forceFlush) {
        logProvider.forceFlush(5000);
      }
    } catch {
      // api-logs not available
    }

    _initialized = false;
    _currentConfig = undefined;
    console.info('Botanu SDK shutdown complete');
  } catch (err) {
    console.error('Error during Botanu SDK shutdown:', err);
  }
}
