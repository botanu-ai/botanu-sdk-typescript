// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Configuration for Botanu SDK.
 *
 * Configuration precedence (highest to lowest):
 * 1. Code arguments (explicit values passed to BotanuConfig)
 * 2. Environment variables (BOTANU_*, OTEL_*)
 * 3. YAML config file (botanu.yaml or specified path)
 * 4. Built-in defaults
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export interface BotanuConfig {
  serviceName: string;
  serviceVersion?: string;
  serviceNamespace?: string;
  deploymentEnvironment: string;
  autoDetectResources: boolean;
  otlpEndpoint: string;
  otlpHeaders?: Record<string, string>;
  maxExportBatchSize: number;
  maxQueueSize: number;
  scheduleDelayMillis: number;
  exportTimeoutMillis: number;
  propagationMode: 'lean' | 'full';
  autoInstrumentPackages: string[];
  configFile?: string;
}

const DEFAULT_AUTO_INSTRUMENT_PACKAGES = [
  'http',
  'express',
  'fastify',
  'koa',
  'pg',
  'mongodb',
  'redis',
  'ioredis',
  'mysql2',
  'grpc',
  'aws-sdk',
  'openai',
  'anthropic',
];

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function getEnvInt(key: string): number | undefined {
  const val = getEnv(key);
  if (val == null) return undefined;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? undefined : parsed;
}

function interpolateEnvVars(content: string): string {
  return content.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
    (_match, varName: string, defaultVal: string | undefined) => {
      const value = process.env[varName];
      if (value != null) return value;
      if (defaultVal != null) return defaultVal;
      return _match;
    },
  );
}

export function loadConfig(overrides?: Partial<BotanuConfig>): BotanuConfig {
  // Try to load from YAML file
  let fileConfig: Partial<BotanuConfig> = {};
  const configPath = overrides?.configFile ?? getEnv('BOTANU_CONFIG_FILE');
  const searchPaths = configPath
    ? [configPath]
    : ['botanu.yaml', 'botanu.yml', 'config/botanu.yaml', 'config/botanu.yml'];

  for (const candidate of searchPaths) {
    const resolved = resolve(candidate);
    if (existsSync(resolved)) {
      fileConfig = loadYamlConfig(resolved);
      break;
    }
  }

  // Resolve API key early (affects endpoint + headers defaults)
  const botanuApiKey = getEnv('BOTANU_API_KEY');

  // Build config with precedence: overrides > env > file > defaults
  const serviceName =
    overrides?.serviceName ??
    getEnv('BOTANU_SERVICE_NAME') ??
    getEnv('OTEL_SERVICE_NAME') ??
    fileConfig.serviceName ??
    'unknown_service';

  const serviceVersion =
    overrides?.serviceVersion ??
    getEnv('OTEL_SERVICE_VERSION') ??
    fileConfig.serviceVersion;

  const serviceNamespace =
    overrides?.serviceNamespace ??
    getEnv('OTEL_SERVICE_NAMESPACE') ??
    fileConfig.serviceNamespace;

  const deploymentEnvironment =
    overrides?.deploymentEnvironment ??
    getEnv('BOTANU_ENVIRONMENT') ??
    getEnv('OTEL_DEPLOYMENT_ENVIRONMENT') ??
    fileConfig.deploymentEnvironment ??
    'production';

  // Auto-detect resources
  let autoDetectResources = overrides?.autoDetectResources ?? fileConfig.autoDetectResources ?? true;
  const envAutoDetect = getEnv('BOTANU_AUTO_DETECT_RESOURCES');
  if (envAutoDetect != null) {
    autoDetectResources = ['true', '1', 'yes'].includes(envAutoDetect.toLowerCase());
  }

  // OTLP endpoint
  let otlpEndpoint =
    overrides?.otlpEndpoint ??
    getEnv('BOTANU_COLLECTOR_ENDPOINT') ??
    getEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT') ??
    getEnv('OTEL_EXPORTER_OTLP_ENDPOINT') ??
    fileConfig.otlpEndpoint;

  if (!otlpEndpoint) {
    // API key implies Botanu Cloud — ALB terminates HTTPS on 443,
    // forwards to collector:4318 internally
    otlpEndpoint = botanuApiKey
      ? 'https://ingest.botanu.ai'
      : 'http://localhost:4318';
  }

  // Headers
  let otlpHeaders = overrides?.otlpHeaders ?? fileConfig.otlpHeaders;
  if (!otlpHeaders && botanuApiKey) {
    otlpHeaders = { Authorization: `Bearer ${botanuApiKey}` };
  }

  // Propagation mode
  let propagationMode: 'lean' | 'full' =
    overrides?.propagationMode ?? fileConfig.propagationMode ?? 'lean';
  const envPropMode = getEnv('BOTANU_PROPAGATION_MODE');
  if (envPropMode === 'lean' || envPropMode === 'full') {
    propagationMode = envPropMode;
  }

  return {
    serviceName,
    serviceVersion,
    serviceNamespace,
    deploymentEnvironment,
    autoDetectResources,
    otlpEndpoint,
    otlpHeaders,
    maxExportBatchSize:
      overrides?.maxExportBatchSize ??
      getEnvInt('BOTANU_MAX_EXPORT_BATCH_SIZE') ??
      fileConfig.maxExportBatchSize ??
      512,
    maxQueueSize:
      overrides?.maxQueueSize ??
      getEnvInt('BOTANU_MAX_QUEUE_SIZE') ??
      fileConfig.maxQueueSize ??
      65536,
    scheduleDelayMillis:
      overrides?.scheduleDelayMillis ??
      fileConfig.scheduleDelayMillis ??
      5000,
    exportTimeoutMillis:
      overrides?.exportTimeoutMillis ??
      getEnvInt('BOTANU_EXPORT_TIMEOUT_MILLIS') ??
      fileConfig.exportTimeoutMillis ??
      30000,
    propagationMode,
    autoInstrumentPackages:
      overrides?.autoInstrumentPackages ??
      fileConfig.autoInstrumentPackages ??
      DEFAULT_AUTO_INSTRUMENT_PACKAGES,
  };
}

function loadYamlConfig(filePath: string): Partial<BotanuConfig> {
  try {
    // Dynamic import for yaml — optional dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yamlModule = require('yaml') as typeof import('yaml');
    const rawContent = readFileSync(filePath, 'utf-8');
    const content = interpolateEnvVars(rawContent);
    const data = yamlModule.parse(content);
    if (!data || typeof data !== 'object') return {};
    return fromDict(data);
  } catch (err) {
    const error = err as { code?: string };
    // Missing yaml package is expected — only warn on actual parse errors
    if (error?.code !== 'MODULE_NOT_FOUND') {
      console.warn(`Botanu: failed to parse config file '${filePath}':`, String(err));
    }
    return {};
  }
}

function fromDict(data: Record<string, unknown>): Partial<BotanuConfig> {
  const service = (data.service ?? {}) as Record<string, unknown>;
  const otlp = (data.otlp ?? {}) as Record<string, unknown>;
  const exportCfg = (data.export ?? {}) as Record<string, unknown>;
  const propagation = (data.propagation ?? {}) as Record<string, unknown>;
  const resource = (data.resource ?? {}) as Record<string, unknown>;
  const autoPackages = data.auto_instrument_packages as string[] | undefined;

  const result: Partial<BotanuConfig> = {};

  if (service.name) result.serviceName = String(service.name);
  if (service.version) result.serviceVersion = String(service.version);
  if (service.namespace) result.serviceNamespace = String(service.namespace);
  if (service.environment) result.deploymentEnvironment = String(service.environment);
  if (resource.auto_detect != null) result.autoDetectResources = Boolean(resource.auto_detect);
  if (otlp.endpoint) result.otlpEndpoint = String(otlp.endpoint);
  if (otlp.headers) result.otlpHeaders = otlp.headers as Record<string, string>;
  if (exportCfg.batch_size) result.maxExportBatchSize = Number(exportCfg.batch_size);
  if (exportCfg.queue_size) result.maxQueueSize = Number(exportCfg.queue_size);
  if (exportCfg.delay_ms) result.scheduleDelayMillis = Number(exportCfg.delay_ms);
  if (exportCfg.export_timeout_ms) result.exportTimeoutMillis = Number(exportCfg.export_timeout_ms);
  if (propagation.mode === 'lean' || propagation.mode === 'full') {
    result.propagationMode = propagation.mode;
  }
  if (autoPackages) result.autoInstrumentPackages = autoPackages;

  return result;
}

export function configToDict(config: BotanuConfig): Record<string, unknown> {
  return {
    service: {
      name: config.serviceName,
      version: config.serviceVersion,
      namespace: config.serviceNamespace,
      environment: config.deploymentEnvironment,
    },
    resource: {
      auto_detect: config.autoDetectResources,
    },
    otlp: {
      endpoint: config.otlpEndpoint,
      headers: config.otlpHeaders,
    },
    export: {
      batch_size: config.maxExportBatchSize,
      queue_size: config.maxQueueSize,
      delay_ms: config.scheduleDelayMillis,
      export_timeout_ms: config.exportTimeoutMillis,
    },
    propagation: {
      mode: config.propagationMode,
    },
    auto_instrument_packages: config.autoInstrumentPackages,
  };
}
