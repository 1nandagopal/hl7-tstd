import { describe, expect, it } from 'vite-plus/test';
import { HL7 } from '../src/index.ts';
import {
  createComplexHierarchyMessage,
  createDiagnosticReportMessage,
  createStandardOruMessage,
} from './helpers.ts';

describe('Method Performance & Profiling Benchmarks', () => {
  const WARMUP_ROUNDS = 50;
  const BENCH_ROUNDS = 500;

  function measure(
    fn: () => void,
    iterations = BENCH_ROUNDS,
  ): { totalMs: number; opsPerSec: number } {
    for (let i = 0; i < WARMUP_ROUNDS; i++) {
      fn();
    }
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const totalMs = performance.now() - start;
    const opsPerSec = Math.round(iterations / (totalMs / 1000));
    return { totalMs, opsPerSec };
  }

  function measureWithSetup<T>(
    setup: () => T,
    fn: (ctx: T) => void,
    iterations = BENCH_ROUNDS,
  ): { totalMs: number; opsPerSec: number } {
    for (let i = 0; i < WARMUP_ROUNDS; i++) {
      const ctx = setup();
      fn(ctx);
    }
    const contexts = Array.from({ length: iterations }, setup);
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn(contexts[i]!);
    }
    const totalMs = performance.now() - start;
    const opsPerSec = Math.round(iterations / (totalMs / 1000));
    return { totalMs, opsPerSec };
  }

  function logMetric(
    methodName: string,
    result: { totalMs: number; opsPerSec: number },
    iterations = BENCH_ROUNDS,
  ) {
    const avgMs = (result.totalMs / iterations).toFixed(3);
    console.log(
      `   📊 [${methodName.padEnd(28)}] ${result.opsPerSec.toLocaleString().padStart(7)} ops/sec | ${avgMs}ms/op (${iterations} ops in ${result.totalMs.toFixed(1)}ms)`,
    );
  }

  it('should benchmark HL7 message parsing throughput (constructor & transform)', () => {
    const raw = createDiagnosticReportMessage();
    const result = measure(() => {
      const hl7 = new HL7(raw);
      expect(hl7.getSegments()).toHaveLength(7);
    });

    logMetric('HL7.constructor/transform', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark HL7 serialization throughput (HL7.build)', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const result = measure(() => {
      const built = hl7.build();
      expect(built.length).toBeGreaterThan(0);
    });

    logMetric('HL7.build', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark segment lookup throughput (HL7.getSegment & getSegments)', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const result = measure(() => {
      const pid = hl7.getSegment('PID');
      const obx = hl7.getSegments('OBX');
      expect(pid?.type).toBe('PID');
      expect(obx).toHaveLength(2);
    });

    logMetric('HL7.getSegment(s)', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark segment traversal throughput (HL7.getSegmentsAfter)', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obr = hl7.getSegment('OBR');
    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    const result = measure(() => {
      const consecutive = hl7.getSegmentsAfter(obr, 'OBX', ['NTE'], true);
      const allAfter = hl7.getSegmentsAfter(obr, 'OBX', ['DG1']);
      expect(consecutive.length).toBeGreaterThan(0);
      expect(allAfter.length).toBeGreaterThan(0);
    });

    logMetric('HL7.getSegmentsAfter', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark segment field, component & subcomponent access (Segment.get)', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const zyx = hl7.getSegment('ZYX');
    expect(zyx).toBeDefined();
    if (!zyx) throw new Error('Expected ZYX segment to be defined');

    const result = measure(() => {
      zyx.get('ZYX.5');
      zyx.get('ZYX.5.1', 1);
      zyx.get('ZYX.5.1', 2, 1);
      zyx.get('ZYX.5', true);
    });

    logMetric('Segment.get (dotted paths)', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark segment tree expansion and field mutation (Segment.set)', () => {
    const raw = createStandardOruMessage();
    const result = measureWithSetup(
      () => {
        const hl7 = new HL7(raw);
        return hl7.createSegment('ABC');
      },
      (segment) => {
        segment.set('ABC.1', 'VAL');
        segment.set('ABC.5.1', 'COMP1', 1, 0);
        segment.set('ABC.5.2', 'COMP2', 1, 0);
        segment.set('ABC.5.1', 'SUB1', 2, 0);
        segment.set('ABC.5.1', 'SUB2', 2, 1);
      },
    );

    logMetric('Segment.set (tree expansion)', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark linked-list insertion throughput (createSegmentAfter & createSegmentBefore)', () => {
    const raw = createStandardOruMessage();
    const result = measureWithSetup(
      () => {
        const hl7 = new HL7(raw);
        const pid = hl7.getSegment('PID');
        return { hl7, pid: pid! };
      },
      ({ hl7, pid }) => {
        hl7.createSegmentBefore('NTE', pid);
        hl7.createSegmentAfter('AL1', pid);
      },
    );

    logMetric('createSegmentAfter/Before', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark linked-list reordering throughput (moveSegmentAfter & moveSegmentBefore)', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obr = hl7.getSegment('OBR');
    const nte = hl7.getSegment('NTE');
    expect(obr).toBeDefined();
    expect(nte).toBeDefined();
    if (!obr || !nte) throw new Error('Expected OBR and NTE segments to be defined');

    const result = measure(() => {
      hl7.moveSegmentAfter(obr, nte);
      hl7.moveSegmentBefore(obr, nte);
    });

    logMetric('moveSegmentAfter/Before', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark batch sequential segment reindexing (HL7.reindexSegments)', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const result = measure(() => {
      hl7.reindexSegments({ OBR: [], OBX: ['OBR'], NTE: ['OBR', 'OBX'] });
    });

    logMetric('HL7.reindexSegments (batch)', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });

  it('should benchmark isolated segment deletion throughput (HL7.deleteSegments)', () => {
    const raw = createDiagnosticReportMessage();
    const result = measureWithSetup(
      () => {
        const hl7 = new HL7(raw);
        const obx = hl7.getSegments('OBX');
        return { hl7, obx };
      },
      ({ hl7, obx }) => {
        hl7.deleteSegments(obx);
      },
    );

    logMetric('HL7.deleteSegments (removal)', result);
    expect(result.opsPerSec).toBeGreaterThan(0);
  });
});
