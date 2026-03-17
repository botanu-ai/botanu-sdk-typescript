# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-03-16

### Added

- Initial open-source release under Apache-2.0 license
- **Core SDK**
  - `enable()` / `disable()` bootstrap functions for SDK initialization
  - `botanuWorkflow()` wrapper with UUIDv7 run_id generation
  - `botanuOutcome()` decorator for sub-function outcome tracking
  - `emitOutcome()` helper for recording business outcomes
  - `setBusinessContext()` for cost attribution dimensions
  - `RunContextEnricher` span processor for automatic run_id propagation

- **LLM Tracking** (aligned with OTel GenAI semantic conventions)
  - `trackLlmCall()` for LLM/model operations
  - `trackToolCall()` for tool/function calls
  - `llmInstrumented()` decorator for auto-instrumenting LLM client methods
  - Token usage tracking (input, output, cached)
  - OTel metrics: token usage histogram, operation duration, attempt counter
  - Provider normalization for 15+ LLM providers
  - Support for all GenAI operations (chat, embeddings, etc.)

- **Data Tracking**
  - `trackDbOperation()` for database operations
  - `trackStorageOperation()` for object storage (S3, GCS, Azure Blob)
  - `trackMessagingOperation()` for message queues (SQS, Kafka, Pub/Sub)
  - System normalization for 30+ database/storage systems

- **Context Propagation**
  - W3C Baggage propagation for cross-service run_id correlation
  - Lean mode (default) and full mode propagation options
  - `RunContext` model with retry tracking and deadline support
  - `setBaggage()` / `setBaggageOn()` helpers returning Context for `context.with()`

- **Resource Detection**
  - Process (built-in)
  - AWS (EC2, ECS, EKS, Lambda)
  - GCP (GCE, Cloud Run, Cloud Functions)
  - Azure (VM, App Service)
  - Container (Docker, Kubernetes)

- **Auto-Instrumentation Support**
  - HTTP clients: http, undici
  - Web frameworks: Express, Fastify, Koa, Hapi, NestJS
  - Databases: PostgreSQL, MongoDB, Redis, MySQL, Prisma, Sequelize, TypeORM, Knex
  - Messaging: AMQP, KafkaJS, BullMQ
  - Caching: Memcached
  - GenAI: OpenAI, Anthropic, Vertex AI, Cohere, Bedrock, Azure OpenAI, LangChain
  - Cloud: AWS SDK, gRPC
  - Runtime: Node.js internals (dns, net, fs)

- **Middleware**
  - Express middleware
  - Fastify plugin
  - Koa middleware
  - All with proper baggage propagation via `context.with()`

- **Retry Integration**
  - p-retry compatible options via `botanuRetryOptions()`
  - AsyncLocalStorage-based attempt tracking (concurrent-safe)
  - Automatic retry detection in `trackLlmCall()`

### Dependencies

- Core: `@opentelemetry/api >= 1.7.0`
- SDK: `@opentelemetry/sdk-trace-node`, `@opentelemetry/exporter-trace-otlp-http`
- Node.js: `>= 18.0.0`

[Unreleased]: https://github.com/botanu-ai/botanu-sdk-typescript/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/botanu-ai/botanu-sdk-typescript/releases/tag/v0.1.0
