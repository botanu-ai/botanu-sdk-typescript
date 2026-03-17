# Configuration API Reference

## BotanuConfig

Configuration object for the SDK.

```typescript
import { BotanuConfig } from '@botanu/sdk';
```

### Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serviceName` | `string` | From env / `"unknown_service"` | Service name |
| `serviceVersion` | `string` | From env | Service version |
| `serviceNamespace` | `string` | From env | Service namespace |
| `deploymentEnvironment` | `string` | From env / `"production"` | Deployment environment |
| `autoDetectResources` | `boolean` | `true` | Auto-detect cloud resources |
| `otlpEndpoint` | `string` | From env / `"http://localhost:4318"` | OTLP endpoint |
| `otlpHeaders` | `Record<string, string>` | `undefined` | Custom headers for OTLP exporter |
| `maxExportBatchSize` | `number` | `512` | Max spans per batch |
| `maxQueueSize` | `number` | `65536` | Max spans in queue (~64 MB at ~1 KB/span) |
| `scheduleDelayMillis` | `number` | `5000` | Delay between batch exports |
| `exportTimeoutMillis` | `number` | `30000` | Timeout for export operations |
| `propagationMode` | `string` | `"lean"` | `"lean"` or `"full"` |
| `autoInstrumentPackages` | `string[]` | See below | Packages to auto-instrument |

### Constructor

```typescript
const config = new BotanuConfig({
  serviceName: 'my-service',
  deploymentEnvironment: 'production',
  otlpEndpoint: 'http://collector:4318',
});
```

### Static Methods

#### fromYaml()

Load configuration from a YAML file.

```typescript
static fromYaml(path: string): BotanuConfig
```

**Parameters:**
- `path`: Path to YAML config file

**Throws:**
- `Error`: If config file does not exist
- `Error`: If YAML is malformed

**Example:**

```typescript
const config = BotanuConfig.fromYaml('config/botanu.yaml');
```

#### fromFileOrEnv()

Load config from file if it exists, otherwise use environment variables.

```typescript
static fromFileOrEnv(path?: string): BotanuConfig
```

**Search order:**
1. Explicit `path` argument
2. `BOTANU_CONFIG_FILE` environment variable
3. `./botanu.yaml`
4. `./botanu.yml`
5. `./config/botanu.yaml`
6. `./config/botanu.yml`
7. Falls back to environment-only config

**Example:**

```typescript
// Auto-discovers config file
const config = BotanuConfig.fromFileOrEnv();

// Explicit path
const config = BotanuConfig.fromFileOrEnv('my-config.yaml');
```

### Instance Methods

#### toDict()

Export configuration as a plain object.

```typescript
toDict(): Record<string, any>
```

**Example:**

```typescript
const config = new BotanuConfig({ serviceName: 'my-service' });
console.log(config.toDict());
// {
//     service: { name: "my-service", ... },
//     otlp: { endpoint: "...", ... },
//     ...
// }
```

---

## YAML Configuration Format

### Full Schema

```yaml
service:
  name: string              # Service name
  version: string           # Service version
  namespace: string         # Service namespace
  environment: string       # Deployment environment

resource:
  auto_detect: boolean      # Auto-detect cloud resources

otlp:
  endpoint: string          # OTLP endpoint URL
  headers:                  # Custom headers
    header-name: value

export:
  batch_size: integer       # Max spans per batch
  queue_size: integer       # Max spans in queue
  delay_ms: integer         # Delay between exports
  export_timeout_ms: integer # Export timeout

propagation:
  mode: string              # "lean" or "full"

auto_instrument_packages:   # List of packages to instrument
  - package_name
```

### Environment Variable Interpolation

```yaml
service:
  name: ${OTEL_SERVICE_NAME:-default-service}
  environment: ${ENVIRONMENT}

otlp:
  endpoint: ${COLLECTOR_URL:-http://localhost:4318}
  headers:
    Authorization: Bearer ${API_TOKEN}
```

Syntax:
- `${VAR_NAME}` - Required variable
- `${VAR_NAME:-default}` - Variable with default value

---

## enable()

Bootstrap function to initialise the SDK.

```typescript
import { enable } from '@botanu/sdk';

enable(options?: {
  serviceName?: string;
  otlpEndpoint?: string;
  environment?: string;
  autoInstrumentation?: boolean;
  propagators?: string[];
  logLevel?: string;
  config?: BotanuConfig;
  configFile?: string;
}): boolean
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `serviceName` | `string` | From env | Service name |
| `otlpEndpoint` | `string` | From env | OTLP endpoint URL |
| `environment` | `string` | From env | Deployment environment |
| `autoInstrumentation` | `boolean` | `true` | Enable auto-instrumentation |
| `propagators` | `string[]` | `["tracecontext", "baggage"]` | Propagator list |
| `logLevel` | `string` | `"INFO"` | Logging level |
| `config` | `BotanuConfig` | `undefined` | Pre-built configuration (overrides individual params) |
| `configFile` | `string` | `undefined` | Path to YAML config file |

### Returns

`true` if successfully initialised, `false` if already initialised.

### Behaviour

1. Creates/merges `BotanuConfig`
2. Configures `TracerProvider` with `RunContextEnricher`
3. Sets up OTLP exporter
4. Enables auto-instrumentation (if requested)
5. Configures W3C Baggage propagation

### Examples

#### Minimal

```typescript
import { enable } from '@botanu/sdk';

enable({ serviceName: 'my-service' });
```

#### With Config Object

```typescript
import { enable, BotanuConfig } from '@botanu/sdk';

const config = BotanuConfig.fromYaml('config/botanu.yaml');
enable({ config });
```

#### From environment only

```typescript
import { enable } from '@botanu/sdk';

// Reads OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT, etc.
enable();
```

---

## disable()

Disable the SDK and clean up resources.

```typescript
import { disable } from '@botanu/sdk';

disable(): void
```

### Behaviour

1. Flushes pending spans
2. Shuts down span processors
3. Disables instrumentation

---

## isEnabled()

Check if the SDK is currently enabled.

```typescript
import { isEnabled } from '@botanu/sdk';

isEnabled(): boolean
```

### Example

```typescript
if (!isEnabled()) {
  enable({ serviceName: 'my-service' });
}
```

---

## Environment Variables

### OpenTelemetry Standard

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name | `"unknown_service"` |
| `OTEL_SERVICE_VERSION` | Service version | None |
| `OTEL_SERVICE_NAMESPACE` | Service namespace | None |
| `OTEL_DEPLOYMENT_ENVIRONMENT` | Deployment environment | `"production"` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP base endpoint | `"http://localhost:4318"` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | OTLP traces endpoint (full URL) | None |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP headers (key=value pairs) | None |

### Botanu-Specific

| Variable | Description | Default |
|----------|-------------|---------|
| `BOTANU_ENVIRONMENT` | Fallback for environment | `"production"` |
| `BOTANU_PROPAGATION_MODE` | `"lean"` or `"full"` | `"lean"` |
| `BOTANU_AUTO_DETECT_RESOURCES` | Auto-detect cloud resources | `"true"` |
| `BOTANU_CONFIG_FILE` | Path to YAML config file | None |
| `BOTANU_COLLECTOR_ENDPOINT` | Override for OTLP endpoint | None |
| `BOTANU_MAX_QUEUE_SIZE` | Override max queue size | `65536` |
| `BOTANU_MAX_EXPORT_BATCH_SIZE` | Override max batch size | `512` |
| `BOTANU_EXPORT_TIMEOUT_MILLIS` | Override export timeout | `30000` |

---

## RunContext

Model for run metadata. Created automatically by `botanuWorkflow` and
`runBotanu`.

```typescript
import { RunContext } from '@botanu/sdk';
```

### Static Methods

#### create()

Create a new run context.

```typescript
static create(options: {
  workflow: string;
  eventId: string;
  customerId: string;
  workflowVersion?: string;
  environment?: string;
  tenantId?: string;
  parentRunId?: string;
  rootRunId?: string;
  attempt?: number;
  retryOfRunId?: string;
  deadlineSeconds?: number;
}): RunContext
```

#### createRetry()

Create a retry context from a previous run.

```typescript
static createRetry(previous: RunContext): RunContext
```

#### fromBaggage()

Reconstruct context from baggage dictionary.

```typescript
static fromBaggage(baggage: Record<string, string>): RunContext | null
```

### Instance Methods

#### toBaggageDict()

Serialise to baggage format.

```typescript
toBaggageDict(options?: { leanMode?: boolean }): Record<string, string>
```

#### toSpanAttributes()

Serialise to span attributes.

```typescript
toSpanAttributes(): Record<string, string | number | boolean>
```

#### complete()

Mark the run as complete.

```typescript
complete(options: {
  status: RunStatus;
  reasonCode?: string;
  errorClass?: string;
  valueType?: string;
  valueAmount?: number;
  confidence?: number;
}): void
```

#### isPastDeadline()

```typescript
isPastDeadline(): boolean
```

#### isCancelled()

```typescript
isCancelled(): boolean
```

#### requestCancellation()

```typescript
requestCancellation(reason?: string): void
```

#### remainingTimeSeconds()

```typescript
remainingTimeSeconds(): number | null
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `runId` | `string` | Unique UUIDv7 identifier |
| `workflow` | `string` | Workflow name |
| `eventId` | `string` | Business event identifier |
| `customerId` | `string` | Customer identifier |
| `environment` | `string` | Deployment environment |
| `workflowVersion` | `string` | Version hash |
| `tenantId` | `string` | Tenant identifier |
| `parentRunId` | `string` | Parent run ID |
| `rootRunId` | `string` | Root run ID (same as `runId` for first attempt) |
| `attempt` | `number` | Attempt number |
| `retryOfRunId` | `string` | Run ID of the previous attempt |
| `startTime` | `Date` | Run start time |
| `deadline` | `number` | Absolute deadline (epoch seconds) |
| `cancelled` | `boolean` | Whether the run is cancelled |
| `outcome` | `RunOutcome` | Recorded outcome |

---

## RunStatus

Enum for run outcome status.

```typescript
import { RunStatus } from '@botanu/sdk';

enum RunStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  PARTIAL = 'partial',
  TIMEOUT = 'timeout',
  CANCELED = 'canceled',
}
```

## See Also

- [Configuration Guide](../getting-started/configuration.md) - Configuration how-to
- [Architecture](../concepts/architecture.md) - SDK design
- [Existing OTel Setup](../integration/existing-otel.md) - Integration patterns
