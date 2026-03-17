// SPDX-FileCopyrightText: 2026 The Botanu Authors
// SPDX-License-Identifier: Apache-2.0

/**
 * Data Tracking — Track database, storage, and messaging operations.
 *
 * @example
 * ```ts
 * const result = await trackDbOperation(
 *   { system: 'postgresql', operation: 'SELECT' },
 *   async (tracker) => {
 *     const rows = await db.query('SELECT * FROM users');
 *     tracker.setResult({ rowsReturned: rows.length });
 *     return rows;
 *   },
 * );
 * ```
 */

import {
  type Span,
  SpanKind,
  SpanStatusCode,
  context,
  trace,
} from '@opentelemetry/api';

// =========================================================================
// System Normalization Maps
// =========================================================================

export const DB_SYSTEMS: Record<string, string> = {
  postgresql: 'postgresql',
  postgres: 'postgresql',
  pg: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mariadb',
  mssql: 'mssql',
  sqlserver: 'mssql',
  oracle: 'oracle',
  sqlite: 'sqlite',
  mongodb: 'mongodb',
  mongo: 'mongodb',
  dynamodb: 'dynamodb',
  cassandra: 'cassandra',
  couchdb: 'couchdb',
  firestore: 'firestore',
  cosmosdb: 'cosmosdb',
  redis: 'redis',
  memcached: 'memcached',
  elasticache: 'elasticache',
  elasticsearch: 'elasticsearch',
  opensearch: 'opensearch',
  snowflake: 'snowflake',
  bigquery: 'bigquery',
  redshift: 'redshift',
  databricks: 'databricks',
  athena: 'athena',
  synapse: 'synapse',
  influxdb: 'influxdb',
  timescaledb: 'timescaledb',
  neo4j: 'neo4j',
  neptune: 'neptune',
};

export const STORAGE_SYSTEMS: Record<string, string> = {
  s3: 's3',
  aws_s3: 's3',
  gcs: 'gcs',
  google_cloud_storage: 'gcs',
  blob: 'azure_blob',
  azure_blob: 'azure_blob',
  minio: 'minio',
  ceph: 'ceph',
  nfs: 'nfs',
  efs: 'efs',
};

export const MESSAGING_SYSTEMS: Record<string, string> = {
  sqs: 'sqs',
  aws_sqs: 'sqs',
  sns: 'sns',
  kinesis: 'kinesis',
  eventbridge: 'eventbridge',
  pubsub: 'pubsub',
  google_pubsub: 'pubsub',
  servicebus: 'servicebus',
  azure_servicebus: 'servicebus',
  eventhub: 'eventhub',
  kafka: 'kafka',
  rabbitmq: 'rabbitmq',
  nats: 'nats',
  redis_pubsub: 'redis_pubsub',
  celery: 'celery',
};

export const DBOperation = {
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  UPSERT: 'UPSERT',
  MERGE: 'MERGE',
  CREATE: 'CREATE',
  DROP: 'DROP',
  ALTER: 'ALTER',
  INDEX: 'INDEX',
  TRANSACTION: 'TRANSACTION',
  BATCH: 'BATCH',
} as const;

export const StorageOperation = {
  GET: 'GET',
  PUT: 'PUT',
  DELETE: 'DELETE',
  LIST: 'LIST',
  HEAD: 'HEAD',
  COPY: 'COPY',
  MULTIPART_UPLOAD: 'MULTIPART_UPLOAD',
} as const;

export const MessagingOperation = {
  PUBLISH: 'publish',
  CONSUME: 'consume',
  RECEIVE: 'receive',
  SEND: 'send',
  SUBSCRIBE: 'subscribe',
} as const;

// =========================================================================
// Database Tracker
// =========================================================================

export class DBTracker {
  readonly system: string;
  readonly operation: string;
  readonly span: Span | undefined;
  readonly startTime: number;

  rowsReturned: number = 0;
  rowsAffected: number = 0;
  bytesRead: number = 0;
  bytesWritten: number = 0;

  constructor(system: string, operation: string, span?: Span) {
    this.system = system;
    this.operation = operation;
    this.span = span;
    this.startTime = Date.now();
  }

  setResult(options: {
    rowsReturned?: number;
    rowsAffected?: number;
    bytesRead?: number;
    bytesWritten?: number;
  }): this {
    this.rowsReturned = options.rowsReturned ?? 0;
    this.rowsAffected = options.rowsAffected ?? 0;
    this.bytesRead = options.bytesRead ?? 0;
    this.bytesWritten = options.bytesWritten ?? 0;
    if (this.span) {
      if (this.rowsReturned > 0) this.span.setAttribute('botanu.data.rows_returned', this.rowsReturned);
      if (this.rowsAffected > 0) this.span.setAttribute('botanu.data.rows_affected', this.rowsAffected);
      if (this.bytesRead > 0) this.span.setAttribute('botanu.data.bytes_read', this.bytesRead);
      if (this.bytesWritten > 0) this.span.setAttribute('botanu.data.bytes_written', this.bytesWritten);
    }
    return this;
  }

  setTable(tableName: string, schema?: string): this {
    if (this.span) {
      this.span.setAttribute('db.collection.name', tableName);
      if (schema) this.span.setAttribute('db.schema', schema);
    }
    return this;
  }

  setQueryId(queryId: string): this {
    this.span?.setAttribute('botanu.warehouse.query_id', queryId);
    return this;
  }

  setBytesScanned(bytesScanned: number): this {
    this.bytesRead = bytesScanned;
    this.span?.setAttribute('botanu.warehouse.bytes_scanned', bytesScanned);
    return this;
  }

  setError(error: Error): this {
    if (this.span) {
      this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      this.span.setAttribute('botanu.data.error', error.constructor.name);
      this.span.recordException(error);
    }
    return this;
  }

  addMetadata(attrs: Record<string, string | number | boolean>): this {
    if (this.span) {
      for (const [key, value] of Object.entries(attrs)) {
        const attrKey = key.startsWith('botanu.') ? key : `botanu.data.${key}`;
        this.span.setAttribute(attrKey, value);
      }
    }
    return this;
  }

  /** @internal */
  _finalize(): void {
    if (!this.span) return;
    const durationMs = Date.now() - this.startTime;
    this.span.setAttribute('botanu.data.duration_ms', durationMs);
  }
}

export interface TrackDbOptions {
  system: string;
  operation: string;
  database?: string;
  extraAttrs?: Record<string, string | number | boolean>;
}

export async function trackDbOperation<T>(
  options: TrackDbOptions,
  fn: (tracker: DBTracker) => T | Promise<T>,
): Promise<T> {
  const dbTracer = trace.getTracer('botanu.data');
  const normalizedSystem = DB_SYSTEMS[options.system.toLowerCase()] ?? options.system.toLowerCase();

  return dbTracer.startActiveSpan(
    `db.${normalizedSystem}.${options.operation.toLowerCase()}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('db.system', normalizedSystem);
      span.setAttribute('db.operation', options.operation.toUpperCase());
      span.setAttribute('botanu.vendor', normalizedSystem);
      if (options.database) span.setAttribute('db.name', options.database);

      if (options.extraAttrs) {
        for (const [key, value] of Object.entries(options.extraAttrs)) {
          span.setAttribute(`botanu.data.${key}`, value);
        }
      }

      const tracker = new DBTracker(normalizedSystem, options.operation, span);

      try {
        const result = await fn(tracker);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        tracker.setError(error);
        throw err;
      } finally {
        tracker._finalize();
        span.end();
      }
    },
  );
}

// =========================================================================
// Storage Tracker
// =========================================================================

export class StorageTracker {
  readonly system: string;
  readonly operation: string;
  readonly span: Span | undefined;
  readonly startTime: number;

  objectsCount: number = 0;
  bytesRead: number = 0;
  bytesWritten: number = 0;

  constructor(system: string, operation: string, span?: Span) {
    this.system = system;
    this.operation = operation;
    this.span = span;
    this.startTime = Date.now();
  }

  setResult(options: {
    objectsCount?: number;
    bytesRead?: number;
    bytesWritten?: number;
  }): this {
    this.objectsCount = options.objectsCount ?? 0;
    this.bytesRead = options.bytesRead ?? 0;
    this.bytesWritten = options.bytesWritten ?? 0;
    if (this.span) {
      if (this.objectsCount > 0) this.span.setAttribute('botanu.data.objects_count', this.objectsCount);
      if (this.bytesRead > 0) this.span.setAttribute('botanu.data.bytes_read', this.bytesRead);
      if (this.bytesWritten > 0) this.span.setAttribute('botanu.data.bytes_written', this.bytesWritten);
    }
    return this;
  }

  setBucket(bucket: string): this {
    this.span?.setAttribute('botanu.storage.bucket', bucket);
    return this;
  }

  setError(error: Error): this {
    if (this.span) {
      this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      this.span.setAttribute('botanu.storage.error', error.constructor.name);
      this.span.recordException(error);
    }
    return this;
  }

  addMetadata(attrs: Record<string, string | number | boolean>): this {
    if (this.span) {
      for (const [key, value] of Object.entries(attrs)) {
        const attrKey = key.startsWith('botanu.') ? key : `botanu.storage.${key}`;
        this.span.setAttribute(attrKey, value);
      }
    }
    return this;
  }

  /** @internal */
  _finalize(): void {
    if (!this.span) return;
    const durationMs = Date.now() - this.startTime;
    this.span.setAttribute('botanu.storage.duration_ms', durationMs);
  }
}

export interface TrackStorageOptions {
  system: string;
  operation: string;
  extraAttrs?: Record<string, string | number | boolean>;
}

export async function trackStorageOperation<T>(
  options: TrackStorageOptions,
  fn: (tracker: StorageTracker) => T | Promise<T>,
): Promise<T> {
  const storageTracer = trace.getTracer('botanu.storage');
  const normalizedSystem = STORAGE_SYSTEMS[options.system.toLowerCase()] ?? options.system.toLowerCase();

  return storageTracer.startActiveSpan(
    `storage.${normalizedSystem}.${options.operation.toLowerCase()}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttribute('botanu.storage.system', normalizedSystem);
      span.setAttribute('botanu.storage.operation', options.operation.toUpperCase());
      span.setAttribute('botanu.vendor', normalizedSystem);

      if (options.extraAttrs) {
        for (const [key, value] of Object.entries(options.extraAttrs)) {
          span.setAttribute(`botanu.storage.${key}`, value);
        }
      }

      const tracker = new StorageTracker(normalizedSystem, options.operation, span);

      try {
        const result = await fn(tracker);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        tracker.setError(error);
        throw err;
      } finally {
        tracker._finalize();
        span.end();
      }
    },
  );
}

// =========================================================================
// Messaging Tracker
// =========================================================================

export class MessagingTracker {
  readonly system: string;
  readonly operation: string;
  readonly destination: string;
  readonly span: Span | undefined;
  readonly startTime: number;

  messageCount: number = 0;
  bytesTransferred: number = 0;

  constructor(system: string, operation: string, destination: string, span?: Span) {
    this.system = system;
    this.operation = operation;
    this.destination = destination;
    this.span = span;
    this.startTime = Date.now();
  }

  setResult(options: {
    messageCount?: number;
    bytesTransferred?: number;
  }): this {
    this.messageCount = options.messageCount ?? 0;
    this.bytesTransferred = options.bytesTransferred ?? 0;
    if (this.span) {
      if (this.messageCount > 0) this.span.setAttribute('botanu.messaging.message_count', this.messageCount);
      if (this.bytesTransferred > 0) this.span.setAttribute('botanu.messaging.bytes_transferred', this.bytesTransferred);
    }
    return this;
  }

  setError(error: Error): this {
    if (this.span) {
      this.span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      this.span.setAttribute('botanu.messaging.error', error.constructor.name);
      this.span.recordException(error);
    }
    return this;
  }

  addMetadata(attrs: Record<string, string | number | boolean>): this {
    if (this.span) {
      for (const [key, value] of Object.entries(attrs)) {
        const attrKey = key.startsWith('botanu.') ? key : `botanu.messaging.${key}`;
        this.span.setAttribute(attrKey, value);
      }
    }
    return this;
  }

  /** @internal */
  _finalize(): void {
    if (!this.span) return;
    const durationMs = Date.now() - this.startTime;
    this.span.setAttribute('botanu.messaging.duration_ms', durationMs);
  }
}

export interface TrackMessagingOptions {
  system: string;
  operation: string;
  destination: string;
  extraAttrs?: Record<string, string | number | boolean>;
}

export async function trackMessagingOperation<T>(
  options: TrackMessagingOptions,
  fn: (tracker: MessagingTracker) => T | Promise<T>,
): Promise<T> {
  const msgTracer = trace.getTracer('botanu.messaging');
  const normalizedSystem = MESSAGING_SYSTEMS[options.system.toLowerCase()] ?? options.system.toLowerCase();
  const spanKind = ['publish', 'send'].includes(options.operation.toLowerCase())
    ? SpanKind.PRODUCER
    : SpanKind.CONSUMER;

  return msgTracer.startActiveSpan(
    `messaging.${normalizedSystem}.${options.operation.toLowerCase()}`,
    { kind: spanKind },
    async (span) => {
      span.setAttribute('messaging.system', normalizedSystem);
      span.setAttribute('messaging.operation', options.operation.toLowerCase());
      span.setAttribute('messaging.destination.name', options.destination);
      span.setAttribute('botanu.vendor', normalizedSystem);

      if (options.extraAttrs) {
        for (const [key, value] of Object.entries(options.extraAttrs)) {
          span.setAttribute(`botanu.messaging.${key}`, value);
        }
      }

      const tracker = new MessagingTracker(normalizedSystem, options.operation, options.destination, span);

      try {
        const result = await fn(tracker);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        tracker.setError(error);
        throw err;
      } finally {
        tracker._finalize();
        span.end();
      }
    },
  );
}

// =========================================================================
// Standalone Helpers
// =========================================================================

export function setDataMetrics(options: {
  rowsReturned?: number;
  rowsAffected?: number;
  bytesRead?: number;
  bytesWritten?: number;
  objectsCount?: number;
  span?: Span;
}): void {
  const targetSpan = options.span ?? trace.getSpan(context.active());
  if (!targetSpan?.isRecording()) return;

  if (options.rowsReturned && options.rowsReturned > 0) targetSpan.setAttribute('botanu.data.rows_returned', options.rowsReturned);
  if (options.rowsAffected && options.rowsAffected > 0) targetSpan.setAttribute('botanu.data.rows_affected', options.rowsAffected);
  if (options.bytesRead && options.bytesRead > 0) targetSpan.setAttribute('botanu.data.bytes_read', options.bytesRead);
  if (options.bytesWritten && options.bytesWritten > 0) targetSpan.setAttribute('botanu.data.bytes_written', options.bytesWritten);
  if (options.objectsCount && options.objectsCount > 0) targetSpan.setAttribute('botanu.data.objects_count', options.objectsCount);
}

export function setWarehouseMetrics(options: {
  queryId: string;
  bytesScanned: number;
  rowsReturned?: number;
  partitionsScanned?: number;
  span?: Span;
}): void {
  const targetSpan = options.span ?? trace.getSpan(context.active());
  if (!targetSpan?.isRecording()) return;

  targetSpan.setAttribute('botanu.warehouse.query_id', options.queryId);
  targetSpan.setAttribute('botanu.warehouse.bytes_scanned', options.bytesScanned);
  if (options.rowsReturned && options.rowsReturned > 0) targetSpan.setAttribute('botanu.data.rows_returned', options.rowsReturned);
  if (options.partitionsScanned && options.partitionsScanned > 0) targetSpan.setAttribute('botanu.warehouse.partitions_scanned', options.partitionsScanned);
}
