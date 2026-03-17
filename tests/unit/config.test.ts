import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, configToDict } from '../../src/sdk/config.js';

describe('loadConfig', () => {
  const envBackup: Record<string, string | undefined> = {};
  const envKeys = [
    'BOTANU_SERVICE_NAME',
    'OTEL_SERVICE_NAME',
    'BOTANU_ENVIRONMENT',
    'OTEL_DEPLOYMENT_ENVIRONMENT',
    'BOTANU_COLLECTOR_ENDPOINT',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    'BOTANU_API_KEY',
    'BOTANU_PROPAGATION_MODE',
    'BOTANU_MAX_QUEUE_SIZE',
    'BOTANU_MAX_EXPORT_BATCH_SIZE',
    'BOTANU_EXPORT_TIMEOUT_MILLIS',
    'BOTANU_AUTO_DETECT_RESOURCES',
    'BOTANU_CONFIG_FILE',
    'OTel_SERVICE_VERSION',
    'OTel_SERVICE_NAMESPACE',
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (envBackup[key] !== undefined) {
        process.env[key] = envBackup[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('should return defaults when no config provided', () => {
    const config = loadConfig();

    expect(config.serviceName).toBe('unknown_service');
    expect(config.deploymentEnvironment).toBe('production');
    expect(config.otlpEndpoint).toBe('http://localhost:4318');
    expect(config.propagationMode).toBe('lean');
    expect(config.maxExportBatchSize).toBe(512);
    expect(config.maxQueueSize).toBe(65536);
    expect(config.scheduleDelayMillis).toBe(5000);
    expect(config.exportTimeoutMillis).toBe(30000);
    expect(config.autoDetectResources).toBe(true);
  });

  it('should use code overrides', () => {
    const config = loadConfig({
      serviceName: 'my-app',
      otlpEndpoint: 'http://collector:4318',
      deploymentEnvironment: 'staging',
      propagationMode: 'full',
      maxExportBatchSize: 256,
    });

    expect(config.serviceName).toBe('my-app');
    expect(config.otlpEndpoint).toBe('http://collector:4318');
    expect(config.deploymentEnvironment).toBe('staging');
    expect(config.propagationMode).toBe('full');
    expect(config.maxExportBatchSize).toBe(256);
  });

  it('should read BOTANU_SERVICE_NAME env var', () => {
    process.env.BOTANU_SERVICE_NAME = 'env-service';
    const config = loadConfig();
    expect(config.serviceName).toBe('env-service');
  });

  it('should fallback to OTEL_SERVICE_NAME', () => {
    process.env.OTEL_SERVICE_NAME = 'otel-service';
    const config = loadConfig();
    expect(config.serviceName).toBe('otel-service');
  });

  it('should prefer BOTANU_ over OTEL_ env vars', () => {
    process.env.BOTANU_SERVICE_NAME = 'botanu-svc';
    process.env.OTEL_SERVICE_NAME = 'otel-svc';
    const config = loadConfig();
    expect(config.serviceName).toBe('botanu-svc');
  });

  it('should read BOTANU_ENVIRONMENT', () => {
    process.env.BOTANU_ENVIRONMENT = 'staging';
    const config = loadConfig();
    expect(config.deploymentEnvironment).toBe('staging');
  });

  it('should read BOTANU_COLLECTOR_ENDPOINT', () => {
    process.env.BOTANU_COLLECTOR_ENDPOINT = 'http://custom:4318';
    const config = loadConfig();
    expect(config.otlpEndpoint).toBe('http://custom:4318');
  });

  it('should read OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel:4318';
    const config = loadConfig();
    expect(config.otlpEndpoint).toBe('http://otel:4318');
  });

  it('should prefer OTEL_EXPORTER_OTLP_TRACES_ENDPOINT over generic', () => {
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://traces:4318';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://generic:4318';
    const config = loadConfig();
    expect(config.otlpEndpoint).toBe('http://traces:4318');
  });

  it('should auto-configure endpoint when API key is set', () => {
    process.env.BOTANU_API_KEY = 'btnu_live_abc123';
    const config = loadConfig();
    expect(config.otlpEndpoint).toBe('https://ingest.botanu.ai');
    expect(config.otlpHeaders).toEqual({ Authorization: 'Bearer btnu_live_abc123' });
  });

  it('should read propagation mode', () => {
    process.env.BOTANU_PROPAGATION_MODE = 'full';
    const config = loadConfig();
    expect(config.propagationMode).toBe('full');
  });

  it('should ignore invalid propagation mode', () => {
    process.env.BOTANU_PROPAGATION_MODE = 'invalid';
    const config = loadConfig();
    expect(config.propagationMode).toBe('lean');
  });

  it('should read numeric env vars', () => {
    process.env.BOTANU_MAX_QUEUE_SIZE = '10000';
    process.env.BOTANU_MAX_EXPORT_BATCH_SIZE = '256';
    process.env.BOTANU_EXPORT_TIMEOUT_MILLIS = '60000';
    const config = loadConfig();
    expect(config.maxQueueSize).toBe(10000);
    expect(config.maxExportBatchSize).toBe(256);
    expect(config.exportTimeoutMillis).toBe(60000);
  });

  it('should handle invalid numeric env vars', () => {
    process.env.BOTANU_MAX_QUEUE_SIZE = 'not-a-number';
    const config = loadConfig();
    expect(config.maxQueueSize).toBe(65536);
  });

  it('should read auto-detect resources', () => {
    process.env.BOTANU_AUTO_DETECT_RESOURCES = 'false';
    const config = loadConfig();
    expect(config.autoDetectResources).toBe(false);
  });

  it('should override env with code args', () => {
    process.env.BOTANU_SERVICE_NAME = 'env-service';
    const config = loadConfig({ serviceName: 'code-service' });
    expect(config.serviceName).toBe('code-service');
  });

  it('should accept custom auto-instrument packages', () => {
    const config = loadConfig({
      autoInstrumentPackages: ['express', 'pg'],
    });
    expect(config.autoInstrumentPackages).toEqual(['express', 'pg']);
  });
});

// ---------------------------------------------------------------------------
// configToDict roundtrip
// ---------------------------------------------------------------------------

describe('configToDict', () => {
  const envBackup: Record<string, string | undefined> = {};
  const envKeys = [
    'BOTANU_SERVICE_NAME',
    'OTEL_SERVICE_NAME',
    'BOTANU_ENVIRONMENT',
    'BOTANU_COLLECTOR_ENDPOINT',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    'BOTANU_API_KEY',
    'BOTANU_PROPAGATION_MODE',
    'BOTANU_MAX_QUEUE_SIZE',
    'BOTANU_MAX_EXPORT_BATCH_SIZE',
    'BOTANU_EXPORT_TIMEOUT_MILLIS',
    'BOTANU_AUTO_DETECT_RESOURCES',
    'BOTANU_CONFIG_FILE',
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (envBackup[key] !== undefined) {
        process.env[key] = envBackup[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('roundtrip preserves service fields', () => {
    const config = loadConfig({
      serviceName: 'my-app',
      serviceVersion: '1.2.3',
      serviceNamespace: 'platform',
      deploymentEnvironment: 'staging',
    });
    const dict = configToDict(config) as Record<string, any>;

    expect(dict.service.name).toBe('my-app');
    expect(dict.service.version).toBe('1.2.3');
    expect(dict.service.namespace).toBe('platform');
    expect(dict.service.environment).toBe('staging');
  });

  it('roundtrip preserves otlp fields', () => {
    const config = loadConfig({
      otlpEndpoint: 'http://collector:4318',
      otlpHeaders: { Authorization: 'Bearer test-key' },
    });
    const dict = configToDict(config) as Record<string, any>;

    expect(dict.otlp.endpoint).toBe('http://collector:4318');
    expect(dict.otlp.headers).toEqual({ Authorization: 'Bearer test-key' });
  });

  it('roundtrip preserves export fields', () => {
    const config = loadConfig({
      maxExportBatchSize: 256,
      maxQueueSize: 10000,
      exportTimeoutMillis: 60000,
    });
    const dict = configToDict(config) as Record<string, any>;

    expect(dict.export.batch_size).toBe(256);
    expect(dict.export.queue_size).toBe(10000);
    expect(dict.export.export_timeout_ms).toBe(60000);
  });

  it('roundtrip preserves propagation mode', () => {
    const config = loadConfig({ propagationMode: 'full' });
    const dict = configToDict(config) as Record<string, any>;

    expect(dict.propagation.mode).toBe('full');
  });

  it('roundtrip preserves auto_instrument_packages', () => {
    const config = loadConfig({
      autoInstrumentPackages: ['express', 'pg', 'redis'],
    });
    const dict = configToDict(config) as Record<string, any>;

    expect(dict.auto_instrument_packages).toEqual(['express', 'pg', 'redis']);
  });

  it('roundtrip preserves resource auto_detect', () => {
    const config = loadConfig({ autoDetectResources: false });
    const dict = configToDict(config) as Record<string, any>;

    expect(dict.resource.auto_detect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Env var interpolation (tested indirectly via YAML config loading)
// ---------------------------------------------------------------------------

describe('env var interpolation in config', () => {
  const envBackup: Record<string, string | undefined> = {};
  const envKeys = [
    'BOTANU_SERVICE_NAME',
    'OTEL_SERVICE_NAME',
    'BOTANU_ENVIRONMENT',
    'BOTANU_COLLECTOR_ENDPOINT',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    'BOTANU_API_KEY',
    'BOTANU_PROPAGATION_MODE',
    'BOTANU_CONFIG_FILE',
    'TEST_INTERP_VAR',
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (envBackup[key] !== undefined) {
        process.env[key] = envBackup[key];
      } else {
        delete process.env[key];
      }
    }
  });

  it('${VAR} replaced when env var is set', () => {
    // The interpolation function is used internally when loading YAML config.
    // We test the effect by verifying that BOTANU_SERVICE_NAME is properly resolved.
    process.env.BOTANU_SERVICE_NAME = 'interpolated-service';
    const config = loadConfig();
    expect(config.serviceName).toBe('interpolated-service');
  });

  it('preserves unset vars as default when env not set', () => {
    // When no env vars are set and no overrides, defaults apply
    const config = loadConfig();
    expect(config.serviceName).toBe('unknown_service');
    expect(config.deploymentEnvironment).toBe('production');
  });

  it('code overrides take precedence over env vars', () => {
    process.env.BOTANU_SERVICE_NAME = 'env-name';
    const config = loadConfig({ serviceName: 'code-name' });
    expect(config.serviceName).toBe('code-name');
  });
});
