import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DBTracker,
  StorageTracker,
  MessagingTracker,
  DB_SYSTEMS,
  STORAGE_SYSTEMS,
  MESSAGING_SYSTEMS,
  DBOperation,
  StorageOperation,
  MessagingOperation,
} from '../../src/tracking/data.js';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor, AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({ sampler: new AlwaysOnSampler() });
provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const {
  trackDbOperation,
  trackStorageOperation,
  trackMessagingOperation,
  setDataMetrics,
  setWarehouseMetrics,
} = await import('../../src/tracking/data.js');
const { trace } = await import('@opentelemetry/api');

function spans() { return exporter.getFinishedSpans(); }
async function flush() { await provider.forceFlush(); }

describe('DB_SYSTEMS', () => {
  it('should normalize database system names', () => {
    expect(DB_SYSTEMS['postgresql']).toBe('postgresql');
    expect(DB_SYSTEMS['postgres']).toBe('postgresql');
    expect(DB_SYSTEMS['pg']).toBe('postgresql');
    expect(DB_SYSTEMS['mysql']).toBe('mysql');
    expect(DB_SYSTEMS['mongodb']).toBe('mongodb');
    expect(DB_SYSTEMS['mongo']).toBe('mongodb');
    expect(DB_SYSTEMS['redis']).toBe('redis');
    expect(DB_SYSTEMS['sqlite']).toBe('sqlite');
    expect(DB_SYSTEMS['dynamodb']).toBe('dynamodb');
    expect(DB_SYSTEMS['elasticsearch']).toBe('elasticsearch');
    expect(DB_SYSTEMS['snowflake']).toBe('snowflake');
    expect(DB_SYSTEMS['bigquery']).toBe('bigquery');
    expect(DB_SYSTEMS['neo4j']).toBe('neo4j');
    expect(DB_SYSTEMS['mssql']).toBe('mssql');
    expect(DB_SYSTEMS['sqlserver']).toBe('mssql');
  });
});

describe('STORAGE_SYSTEMS', () => {
  it('should normalize storage system names', () => {
    expect(STORAGE_SYSTEMS['s3']).toBe('s3');
    expect(STORAGE_SYSTEMS['aws_s3']).toBe('s3');
    expect(STORAGE_SYSTEMS['gcs']).toBe('gcs');
    expect(STORAGE_SYSTEMS['google_cloud_storage']).toBe('gcs');
    expect(STORAGE_SYSTEMS['blob']).toBe('azure_blob');
    expect(STORAGE_SYSTEMS['azure_blob']).toBe('azure_blob');
    expect(STORAGE_SYSTEMS['minio']).toBe('minio');
  });
});

describe('MESSAGING_SYSTEMS', () => {
  it('should normalize messaging system names', () => {
    expect(MESSAGING_SYSTEMS['sqs']).toBe('sqs');
    expect(MESSAGING_SYSTEMS['aws_sqs']).toBe('sqs');
    expect(MESSAGING_SYSTEMS['kafka']).toBe('kafka');
    expect(MESSAGING_SYSTEMS['rabbitmq']).toBe('rabbitmq');
    expect(MESSAGING_SYSTEMS['pubsub']).toBe('pubsub');
    expect(MESSAGING_SYSTEMS['google_pubsub']).toBe('pubsub');
    expect(MESSAGING_SYSTEMS['sns']).toBe('sns');
    expect(MESSAGING_SYSTEMS['kinesis']).toBe('kinesis');
    expect(MESSAGING_SYSTEMS['nats']).toBe('nats');
    expect(MESSAGING_SYSTEMS['celery']).toBe('celery');
  });
});

describe('Operation Constants', () => {
  it('should have all DB operations', () => {
    expect(DBOperation.SELECT).toBe('SELECT');
    expect(DBOperation.INSERT).toBe('INSERT');
    expect(DBOperation.UPDATE).toBe('UPDATE');
    expect(DBOperation.DELETE).toBe('DELETE');
    expect(DBOperation.UPSERT).toBe('UPSERT');
    expect(DBOperation.BATCH).toBe('BATCH');
  });

  it('should have all storage operations', () => {
    expect(StorageOperation.GET).toBe('GET');
    expect(StorageOperation.PUT).toBe('PUT');
    expect(StorageOperation.DELETE).toBe('DELETE');
    expect(StorageOperation.LIST).toBe('LIST');
    expect(StorageOperation.HEAD).toBe('HEAD');
    expect(StorageOperation.COPY).toBe('COPY');
  });

  it('should have all messaging operations', () => {
    expect(MessagingOperation.PUBLISH).toBe('publish');
    expect(MessagingOperation.CONSUME).toBe('consume');
    expect(MessagingOperation.RECEIVE).toBe('receive');
    expect(MessagingOperation.SEND).toBe('send');
    expect(MessagingOperation.SUBSCRIBE).toBe('subscribe');
  });
});

describe('DBTracker', () => {
  it('should create with system and operation', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');

    expect(tracker.system).toBe('postgresql');
    expect(tracker.operation).toBe('SELECT');
    expect(tracker.rowsReturned).toBe(0);
    expect(tracker.rowsAffected).toBe(0);
  });

  it('should set result metrics', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');
    tracker.setResult({ rowsReturned: 42, bytesRead: 1024 });

    expect(tracker.rowsReturned).toBe(42);
    expect(tracker.bytesRead).toBe(1024);
  });

  it('should set error', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');
    // Without span, should not throw
    tracker.setError(new Error('Connection refused'));
  });

  it('should chain methods fluently', () => {
    const tracker = new DBTracker('postgresql', 'SELECT');
    const result = tracker
      .setResult({ rowsReturned: 10 })
      .setTable('users', 'public');

    expect(result).toBe(tracker);
    expect(tracker.rowsReturned).toBe(10);
  });
});

describe('StorageTracker', () => {
  it('should create with system and operation', () => {
    const tracker = new StorageTracker('s3', 'GET');

    expect(tracker.system).toBe('s3');
    expect(tracker.operation).toBe('GET');
    expect(tracker.objectsCount).toBe(0);
    expect(tracker.bytesRead).toBe(0);
  });

  it('should set result metrics', () => {
    const tracker = new StorageTracker('s3', 'PUT');
    tracker.setResult({ objectsCount: 1, bytesWritten: 2048 });

    expect(tracker.objectsCount).toBe(1);
    expect(tracker.bytesWritten).toBe(2048);
  });

  it('should chain methods', () => {
    const tracker = new StorageTracker('s3', 'GET');
    const result = tracker
      .setResult({ bytesRead: 512 })
      .setBucket('my-bucket');

    expect(result).toBe(tracker);
  });
});

describe('MessagingTracker', () => {
  it('should create with system, operation, and destination', () => {
    const tracker = new MessagingTracker('kafka', 'publish', 'events-topic');

    expect(tracker.system).toBe('kafka');
    expect(tracker.operation).toBe('publish');
    expect(tracker.destination).toBe('events-topic');
    expect(tracker.messageCount).toBe(0);
  });

  it('should set result metrics', () => {
    const tracker = new MessagingTracker('sqs', 'send', 'my-queue');
    tracker.setResult({ messageCount: 5, bytesTransferred: 4096 });

    expect(tracker.messageCount).toBe(5);
    expect(tracker.bytesTransferred).toBe(4096);
  });

  it('should set error', () => {
    const tracker = new MessagingTracker('kafka', 'publish', 'topic');
    tracker.setError(new Error('Broker unavailable'));
  });

  it('should chain methods', () => {
    const tracker = new MessagingTracker('kafka', 'publish', 'topic');
    const result = tracker.setResult({ messageCount: 3 });
    expect(result).toBe(tracker);
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — trackDbOperation
// ---------------------------------------------------------------------------

describe('trackDbOperation (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('creates span with correct name', async () => {
    await trackDbOperation(
      { system: 'postgresql', operation: 'SELECT' },
      async () => [{ id: 1 }],
    );
    await flush();

    expect(spans().length).toBe(1);
    expect(spans()[0].name).toBe('db.postgresql.select');
  });

  it('sets db.system and db.operation attributes', async () => {
    await trackDbOperation(
      { system: 'postgresql', operation: 'INSERT', database: 'mydb' },
      async () => 'inserted',
    );
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['db.system']).toBe('postgresql');
    expect(attrs['db.operation']).toBe('INSERT');
    expect(attrs['botanu.vendor']).toBe('postgresql');
    expect(attrs['db.name']).toBe('mydb');
  });

  it('tracker.setResult() sets rows attributes', async () => {
    await trackDbOperation(
      { system: 'postgresql', operation: 'SELECT' },
      async (tracker) => {
        tracker.setResult({ rowsReturned: 42, bytesRead: 1024 });
        return 'rows';
      },
    );
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.data.rows_returned']).toBe(42);
    expect(attrs['botanu.data.bytes_read']).toBe(1024);
  });

  it('records error on exception', async () => {
    await expect(
      trackDbOperation(
        { system: 'postgresql', operation: 'SELECT' },
        async () => { throw new Error('connection refused'); },
      ),
    ).rejects.toThrow('connection refused');
    await flush();

    const s = spans()[0];
    expect(s.status.code).toBe(SpanStatusCode.ERROR);
    expect(s.attributes['botanu.data.error']).toBe('Error');
    const exceptions = s.events.filter((e) => e.name === 'exception');
    expect(exceptions.length).toBe(1);
  });

  it('normalizes system aliases (pg → postgresql)', async () => {
    await trackDbOperation(
      { system: 'pg', operation: 'SELECT' },
      async () => [],
    );
    await flush();

    expect(spans()[0].attributes['db.system']).toBe('postgresql');
    expect(spans()[0].name).toBe('db.postgresql.select');
  });

  it('creates CLIENT span kind', async () => {
    await trackDbOperation(
      { system: 'mysql', operation: 'INSERT' },
      async () => 'ok',
    );
    await flush();

    expect(spans()[0].kind).toBe(SpanKind.CLIENT);
  });

  it('sets duration_ms attribute', async () => {
    await trackDbOperation(
      { system: 'postgresql', operation: 'SELECT' },
      async () => 'done',
    );
    await flush();

    const durationMs = spans()[0].attributes['botanu.data.duration_ms'] as number;
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — trackStorageOperation
// ---------------------------------------------------------------------------

describe('trackStorageOperation (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('creates span with correct name', async () => {
    await trackStorageOperation(
      { system: 's3', operation: 'GET' },
      async () => Buffer.from('data'),
    );
    await flush();

    expect(spans().length).toBe(1);
    expect(spans()[0].name).toBe('storage.s3.get');
  });

  it('sets storage attributes', async () => {
    await trackStorageOperation(
      { system: 's3', operation: 'PUT' },
      async () => 'uploaded',
    );
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.storage.system']).toBe('s3');
    expect(attrs['botanu.storage.operation']).toBe('PUT');
    expect(attrs['botanu.vendor']).toBe('s3');
  });

  it('tracker.setResult() sets objects/bytes attributes', async () => {
    await trackStorageOperation(
      { system: 's3', operation: 'PUT' },
      async (tracker) => {
        tracker.setResult({ objectsCount: 3, bytesWritten: 4096 });
        return 'ok';
      },
    );
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.data.objects_count']).toBe(3);
    expect(attrs['botanu.data.bytes_written']).toBe(4096);
  });

  it('records error on exception', async () => {
    await expect(
      trackStorageOperation(
        { system: 'gcs', operation: 'GET' },
        async () => { throw new Error('access denied'); },
      ),
    ).rejects.toThrow('access denied');
    await flush();

    const s = spans()[0];
    expect(s.status.code).toBe(SpanStatusCode.ERROR);
    expect(s.attributes['botanu.storage.error']).toBe('Error');
  });

  it('normalizes system aliases (aws_s3 → s3)', async () => {
    await trackStorageOperation(
      { system: 'aws_s3', operation: 'LIST' },
      async () => [],
    );
    await flush();

    expect(spans()[0].attributes['botanu.storage.system']).toBe('s3');
  });

  it('creates CLIENT span kind', async () => {
    await trackStorageOperation(
      { system: 's3', operation: 'GET' },
      async () => 'ok',
    );
    await flush();

    expect(spans()[0].kind).toBe(SpanKind.CLIENT);
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — trackMessagingOperation
// ---------------------------------------------------------------------------

describe('trackMessagingOperation (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('creates span for publish with PRODUCER kind', async () => {
    await trackMessagingOperation(
      { system: 'kafka', operation: 'publish', destination: 'events-topic' },
      async () => 'sent',
    );
    await flush();

    expect(spans().length).toBe(1);
    expect(spans()[0].name).toBe('messaging.kafka.publish');
    expect(spans()[0].kind).toBe(SpanKind.PRODUCER);
  });

  it('creates span for consume with CONSUMER kind', async () => {
    await trackMessagingOperation(
      { system: 'sqs', operation: 'consume', destination: 'my-queue' },
      async () => 'received',
    );
    await flush();

    expect(spans()[0].kind).toBe(SpanKind.CONSUMER);
  });

  it('creates span for send with PRODUCER kind', async () => {
    await trackMessagingOperation(
      { system: 'sqs', operation: 'send', destination: 'my-queue' },
      async () => 'sent',
    );
    await flush();

    expect(spans()[0].kind).toBe(SpanKind.PRODUCER);
  });

  it('sets messaging attributes', async () => {
    await trackMessagingOperation(
      { system: 'kafka', operation: 'publish', destination: 'orders' },
      async () => 'ok',
    );
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['messaging.system']).toBe('kafka');
    expect(attrs['messaging.operation']).toBe('publish');
    expect(attrs['messaging.destination.name']).toBe('orders');
    expect(attrs['botanu.vendor']).toBe('kafka');
  });

  it('tracker.setResult() sets message count attributes', async () => {
    await trackMessagingOperation(
      { system: 'kafka', operation: 'publish', destination: 'topic' },
      async (tracker) => {
        tracker.setResult({ messageCount: 10, bytesTransferred: 8192 });
        return 'ok';
      },
    );
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.messaging.message_count']).toBe(10);
    expect(attrs['botanu.messaging.bytes_transferred']).toBe(8192);
  });

  it('records error on exception', async () => {
    await expect(
      trackMessagingOperation(
        { system: 'kafka', operation: 'publish', destination: 'topic' },
        async () => { throw new Error('broker unavailable'); },
      ),
    ).rejects.toThrow('broker unavailable');
    await flush();

    const s = spans()[0];
    expect(s.status.code).toBe(SpanStatusCode.ERROR);
    expect(s.attributes['botanu.messaging.error']).toBe('Error');
  });

  it('normalizes system aliases (aws_sqs → sqs)', async () => {
    await trackMessagingOperation(
      { system: 'aws_sqs', operation: 'send', destination: 'queue' },
      async () => 'ok',
    );
    await flush();

    expect(spans()[0].attributes['messaging.system']).toBe('sqs');
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — setDataMetrics
// ---------------------------------------------------------------------------

describe('setDataMetrics (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('sets attributes on current span', async () => {
    const tracer = trace.getTracer('test-data-metrics');
    await tracer.startActiveSpan('test-span', async (span) => {
      setDataMetrics({
        rowsReturned: 100,
        rowsAffected: 5,
        bytesRead: 2048,
        bytesWritten: 512,
        objectsCount: 3,
      });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.data.rows_returned']).toBe(100);
    expect(attrs['botanu.data.rows_affected']).toBe(5);
    expect(attrs['botanu.data.bytes_read']).toBe(2048);
    expect(attrs['botanu.data.bytes_written']).toBe(512);
    expect(attrs['botanu.data.objects_count']).toBe(3);
  });

  it('omits zero-value attributes', async () => {
    const tracer = trace.getTracer('test-data-metrics');
    await tracer.startActiveSpan('test-span', async (span) => {
      setDataMetrics({ rowsReturned: 10 });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.data.rows_returned']).toBe(10);
    expect(attrs['botanu.data.rows_affected']).toBeUndefined();
    expect(attrs['botanu.data.bytes_read']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// OTel span-based tests — setWarehouseMetrics
// ---------------------------------------------------------------------------

describe('setWarehouseMetrics (OTel spans)', () => {
  beforeEach(() => {
    exporter.reset();
  });

  afterEach(async () => {
    await flush();
  });

  it('sets attributes on current span', async () => {
    const tracer = trace.getTracer('test-warehouse-metrics');
    await tracer.startActiveSpan('test-span', async (span) => {
      setWarehouseMetrics({
        queryId: 'q-abc-123',
        bytesScanned: 1048576,
        rowsReturned: 500,
        partitionsScanned: 4,
      });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.warehouse.query_id']).toBe('q-abc-123');
    expect(attrs['botanu.warehouse.bytes_scanned']).toBe(1048576);
    expect(attrs['botanu.data.rows_returned']).toBe(500);
    expect(attrs['botanu.warehouse.partitions_scanned']).toBe(4);
  });

  it('omits optional attributes when not provided', async () => {
    const tracer = trace.getTracer('test-warehouse-metrics');
    await tracer.startActiveSpan('test-span', async (span) => {
      setWarehouseMetrics({ queryId: 'q-1', bytesScanned: 100 });
      span.end();
    });
    await flush();

    const attrs = spans()[0].attributes;
    expect(attrs['botanu.warehouse.query_id']).toBe('q-1');
    expect(attrs['botanu.warehouse.bytes_scanned']).toBe(100);
    expect(attrs['botanu.data.rows_returned']).toBeUndefined();
    expect(attrs['botanu.warehouse.partitions_scanned']).toBeUndefined();
  });
});
