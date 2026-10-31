import { describe, expect, it } from 'vite-plus/test';
import { HL7, type Segment } from '../src/index.ts';
import {
  collectSegmentTypes,
  createAsteriskDelimitedMessage,
  createCustomEncodingCharactersMessage,
  createDiagnosticReportMessage,
  createGroupedObservationsMessage,
  createInpatientAdtMessage,
} from './helpers.ts';

describe('HL7 Message Construction & Initialization', () => {
  it('should parse a standard ORU diagnostic message and preserve segment ordering', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'NTE', 'DG1']);
    expect(hl7.getSegment('PID')?.type).toBe('PID');
    expect(hl7.getSegments('OBX')).toHaveLength(2);
  });

  it('should parse messages containing alphanumeric segment identifiers (e.g. PV1)', () => {
    const hl7 = new HL7(createInpatientAdtMessage());

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'PV1']);
    expect(hl7.getSegment('PV1')?.type).toBe('PV1');
  });

  it('should parse CRLF-delimited messages using the default end-of-line regex', () => {
    const hl7 = new HL7(createDiagnosticReportMessage('\r\n'));

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'NTE', 'DG1']);
  });

  it('should gracefully ignore trailing blank lines during message transformation', () => {
    const raw = `${createDiagnosticReportMessage()}\r\r`;
    const hl7 = new HL7(raw);

    expect(hl7.getSegments()).toHaveLength(7);
  });

  it('should ensure transform is idempotent and does not duplicate segments on re-run', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const beforeCount = hl7.getSegments().length;

    hl7.transform();
    hl7.transform();

    expect(beforeCount).toBe(7);
    expect(hl7.getSegments()).toHaveLength(7);
  });

  it.skip('should infer custom field delimiter from MSH-1 without explicit parse options', () => {
    const hl7 = new HL7(createAsteriskDelimitedMessage());

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID']);
    expect(hl7.getSegment('PID')?.get('PID.5.2')).toBe('JANE');
    expect(hl7.build()).toMatch(/^MSH\*/);
  });

  it.skip('should infer custom encoding characters from MSH-2', () => {
    const hl7 = new HL7(createCustomEncodingCharactersMessage());
    const pid = hl7.getSegment('PID');
    const obx = hl7.getSegment('OBX');

    expect(pid).toBeDefined();
    expect(obx).toBeDefined();
    if (!pid || !obx) throw new Error('Expected PID and OBX segments to be defined');

    expect(pid.get('PID.3.4')).toBe('MRN');
    expect(pid.get('PID.5.2')).toBe('JANE');
    expect(obx.get('OBX.5', true)).toBe('Alpha$Beta');
    expect(hl7.build()).toMatch(/^MSH\*[@][$][%][?]\*/);
  });

  it('should respect explicit custom delimiters for parsing and serialization', () => {
    const hl7 = new HL7(createAsteriskDelimitedMessage(), {
      fieldDelim: '*',
      eolDelim: '\n',
      buildEolChar: '\n',
    });

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID']);
    expect(hl7.getSegment('PID')?.type).toBe('PID');
    expect(hl7.build()).toMatch(/^MSH\*/);
    expect(hl7.build()).toMatch(/\nPID\*/);
  });

  it('should throw validation error when raw message does not start with MSH', () => {
    expect(() => new HL7(null as unknown as string)).toThrow(/Invalid raw HL7 message/);
    expect(() => new HL7('PID|1||123')).toThrow(/Invalid raw HL7 message/);
  });
});

describe('HL7 Segment Traversal & Retrieval', () => {
  it('should validate segment type format when calling getSegment or getSegments', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());

    expect(() => hl7.getSegment('PID.3' as unknown as 'PID')).toThrow(/Invalid parameter: 'type'/);
    expect(() => hl7.getSegments('PID.3' as unknown as 'PID')).toThrow(/Invalid parameter: 'type'/);
  });

  it('should retrieve matching segments following a start segment until a stop type is reached', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obr = hl7.getSegment('OBR');

    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    expect(hl7.getSegmentsAfter(obr, 'OBX', ['NTE']).map((segment) => segment.type)).toEqual([
      'OBX',
      'OBX',
    ]);
  });

  it('should respect consecutive mode and stop immediately at first non-matching segment', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obr = hl7.getSegment('OBR');

    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    expect(hl7.getSegmentsAfter(obr, 'OBX', [], true).map((segment) => segment.type)).toEqual([
      'OBX',
      'OBX',
    ]);
  });

  it('should throw when getSegmentsAfter is provided foreign or invalid parameters', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const otherHl7 = new HL7(createInpatientAdtMessage());
    const obr = hl7.getSegment('OBR');
    const foreignPv1 = otherHl7.getSegment('PV1');

    expect(obr).toBeDefined();
    expect(foreignPv1).toBeDefined();
    if (!obr || !foreignPv1) throw new Error('Expected OBR and foreign PV1 segments to be defined');

    expect(() => hl7.getSegmentsAfter(null as unknown as Segment, 'OBX')).toThrow(
      /Invalid parameter: 'startSegment'/,
    );
    expect(() => hl7.getSegmentsAfter(obr, 'OBX', 'NTE' as unknown as [])).toThrow(
      /Invalid parameter: 'stopSegmentType'/,
    );
    expect(() => hl7.getSegmentsAfter(obr, 'OBX', [], 'yes' as unknown as boolean)).toThrow(
      /Invalid parameter: 'consecutive'/,
    );
    expect(() => hl7.getSegmentsAfter(foreignPv1, 'OBX')).toThrow(
      /Failed to locate: 'startSegment'/,
    );
  });
});

describe('HL7 Structural Manipulation Operations', () => {
  it('should append newly created segment to the end of the message', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());

    hl7.createSegment('AL1');

    expect(collectSegmentTypes(hl7)).toEqual([
      'MSH',
      'PID',
      'OBR',
      'OBX',
      'OBX',
      'NTE',
      'DG1',
      'AL1',
    ]);
  });

  it('should insert a new segment immediately after target segment', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obr = hl7.getSegment('OBR');

    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    hl7.createSegmentAfter('NTE', obr);

    expect(collectSegmentTypes(hl7)).toEqual([
      'MSH',
      'PID',
      'OBR',
      'NTE',
      'OBX',
      'OBX',
      'NTE',
      'DG1',
    ]);
  });

  it('should insert a new segment immediately before target segment', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obr = hl7.getSegment('OBR');

    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    hl7.createSegmentBefore('NTE', obr);

    expect(collectSegmentTypes(hl7)).toEqual([
      'MSH',
      'PID',
      'NTE',
      'OBR',
      'OBX',
      'OBX',
      'NTE',
      'DG1',
    ]);
  });

  it('should reject insertion when target segment is null or foreign to the message', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const otherHl7 = new HL7(createInpatientAdtMessage());
    const foreignPv1 = otherHl7.getSegment('PV1');

    expect(foreignPv1).toBeDefined();
    if (!foreignPv1) throw new Error('Expected foreign PV1 segment to be defined');

    expect(() => hl7.createSegmentAfter('NTE', null as unknown as Segment)).toThrow(
      /Invalid parameter: 'targetSegment'/,
    );
    expect(() => hl7.createSegmentBefore('NTE', null as unknown as Segment)).toThrow(
      /Invalid parameter: 'targetSegment'/,
    );
    expect(() => hl7.createSegmentAfter('NTE', foreignPv1)).toThrow(
      /Failed to locate: 'targetSegment'/,
    );
    expect(() => hl7.createSegmentBefore('NTE', foreignPv1)).toThrow(
      /Failed to locate: 'targetSegment'/,
    );
  });

  it('should delete a single located segment from the linked list', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const nte = hl7.getSegment('NTE');

    expect(nte).toBeDefined();
    if (!nte) throw new Error('Expected NTE segment to be defined');

    hl7.deleteSegment(nte);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'DG1']);
  });

  it('should delete multiple segments in a single batch call', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obxSegments = hl7.getSegments('OBX');

    hl7.deleteSegments(obxSegments);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'NTE', 'DG1']);
  });

  it('should reject deleting already-deleted or foreign segments', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const otherHl7 = new HL7(createInpatientAdtMessage());
    const foreignPv1 = otherHl7.getSegment('PV1');
    const nte = hl7.getSegment('NTE');

    expect(foreignPv1).toBeDefined();
    expect(nte).toBeDefined();
    if (!foreignPv1 || !nte) throw new Error('Expected foreign PV1 and NTE segments to be defined');

    hl7.deleteSegment(nte);

    expect(() => hl7.deleteSegment(nte)).toThrow(/Failed to locate: 'segment'/);
    expect(() => hl7.deleteSegment(foreignPv1)).toThrow(/Failed to locate: 'segment'/);
    expect(() => hl7.deleteSegments([null as unknown as Segment])).toThrow(
      /Invalid parameter: 'segments'/,
    );
  });

  it('should reposition a segment later in the message using moveSegmentAfter', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const nte = hl7.getSegment('NTE');
    const pid = hl7.getSegment('PID');

    expect(nte).toBeDefined();
    expect(pid).toBeDefined();
    if (!nte || !pid) throw new Error('Expected NTE and PID segments to be defined');

    hl7.moveSegmentAfter(nte, pid);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'NTE', 'OBR', 'OBX', 'OBX', 'DG1']);
  });

  it('should reposition a segment earlier in the message using moveSegmentBefore', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const nte = hl7.getSegment('NTE');
    const obr = hl7.getSegment('OBR');

    expect(nte).toBeDefined();
    expect(obr).toBeDefined();
    if (!nte || !obr) throw new Error('Expected NTE and OBR segments to be defined');

    hl7.moveSegmentBefore(nte, obr);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'NTE', 'OBR', 'OBX', 'OBX', 'DG1']);
  });

  it('should reject move operations on foreign or invalid segments', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const otherHl7 = new HL7(createInpatientAdtMessage());
    const pid = hl7.getSegment('PID');
    const foreignPv1 = otherHl7.getSegment('PV1');

    expect(pid).toBeDefined();
    expect(foreignPv1).toBeDefined();
    if (!pid || !foreignPv1) throw new Error('Expected PID and foreign PV1 segments to be defined');

    expect(() => hl7.moveSegmentAfter(null as unknown as Segment, pid)).toThrow(
      /Invalid parameter: 'segment'/,
    );
    expect(() => hl7.moveSegmentBefore(pid, null as unknown as Segment)).toThrow(
      /Invalid parameter: 'targetSegment'/,
    );
    expect(() => hl7.moveSegmentAfter(foreignPv1, pid)).toThrow(/Failed to locate: 'segment'/);
    expect(() => hl7.moveSegmentBefore(pid, foreignPv1)).toThrow(
      /Failed to locate: 'targetSegment'/,
    );
  });
});

describe('HL7 Sequential Reindexing & Serialization', () => {
  it('should reindex segment counters following reset trigger rules', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());

    hl7.reindexSegments({ OBR: [], OBX: ['OBR'], NTE: ['OBR', 'OBX'] });

    expect(hl7.build()).toMatch(/OBR\|1\|/);
    expect(hl7.build()).toMatch(/OBX\|1\|TX\|CODE1/);
    expect(hl7.build()).toMatch(/OBX\|2\|TX\|CODE2/);
    expect(hl7.build()).toMatch(/NTE\|1\|L\|Observation note/);
  });

  it('should reset index sequence when trigger segment is not itself reindexed', () => {
    const hl7 = new HL7(createGroupedObservationsMessage());

    hl7.reindexSegments({ NTE: ['OBR'] });

    expect(hl7.getSegments('NTE')[0]?.get('NTE.1')).toBe('1');
    expect(hl7.getSegments('NTE')[1]?.get('NTE.1')).toBe('1');
  });

  it('should support custom start index and target field for reindexing', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());

    hl7.reindexSegments({ OBX: [] }, 10, '2');

    const obxSegments = hl7.getSegments('OBX');
    expect(obxSegments[0]?.get('OBX.2')).toBe('10');
    expect(obxSegments[1]?.get('OBX.2')).toBe('11');
  });

  it('should validate inputs passed to reindexSegments', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());

    expect(() => hl7.reindexSegments(null as unknown as Record<string, string[]>)).toThrow(
      /Invalid parameter: 'reindexConfig'/,
    );
    expect(() => hl7.reindexSegments({ OBX: 'OBR' as unknown as string[] })).toThrow(
      /Invalid parameter: 'reindexConfig'/,
    );
    expect(() => hl7.reindexSegments({ OBX: [] }, 0)).toThrow(/Invalid parameter: 'startIndex'/);
    expect(() => hl7.reindexSegments({ OBX: [] }, 1, '1.1.1')).toThrow(
      /Invalid parameter: 'field'/,
    );
  });

  it('should serialize with standard canonical carriage return as default EOL', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const built = hl7.build();

    expect(built).toMatch(/\rPID\|/);
    expect(built).not.toMatch(/\r\nPID\|/);
  });
});
