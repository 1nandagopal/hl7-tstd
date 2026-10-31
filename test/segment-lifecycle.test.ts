import { describe, expect, it } from 'vite-plus/test';
import { HL7 } from '../src/index.ts';
import {
  collectSegmentTypes,
  createAsteriskDelimitedMessage,
  createComplexHierarchyMessage,
  createDiagnosticReportMessage,
  createStandardOruMessage,
  getLastSerializedSegmentLine,
  joinSegments,
} from './helpers.ts';

describe('Segment Lifecycle & Traversal Operations', () => {
  it('should return null or empty array when querying segment types not present in message', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());

    expect(hl7.getSegment('AL1')).toBeNull();
    expect(hl7.getSegments('AL1')).toEqual([]);
  });

  it('should parse repeated patient identifiers and support selecting individual repetitions', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ADT^A01|MSGID7|P|2.3',
      'PID|1||12345^^^MRN~67890^^^NHS||DOE^JOHN',
    ]);
    const hl7 = new HL7(raw);
    const pid = hl7.getSegment('PID');

    expect(pid).toBeDefined();
    if (!pid) throw new Error('Expected PID segment to be defined');

    expect(pid.get('PID.3')).toBe('12345^^^MRN');
    expect(pid.get('PID.3', true)).toBe('12345^^^MRN~67890^^^NHS');
    expect(pid.get('PID.3.1', 1)).toBe('67890');
    expect(pid.get('PID.3.4', 1)).toBe('NHS');
  });

  it('should return empty array when getSegmentsAfter is called on the final segment of a message', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const dg1 = hl7.getSegment('DG1');

    expect(dg1).toBeDefined();
    if (!dg1) throw new Error('Expected DG1 segment to be defined');

    expect(hl7.getSegmentsAfter(dg1, 'OBX')).toEqual([]);
  });

  it('should cleanly append to message when createSegmentAfter targets the current tail segment', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const dg1 = hl7.getSegment('DG1');

    expect(dg1).toBeDefined();
    if (!dg1) throw new Error('Expected DG1 segment to be defined');

    const al1 = hl7.createSegmentAfter('AL1', dg1);
    al1.set('AL1.3', 'PENICILLIN');

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
    expect(hl7.build()).toContain('AL1|||PENICILLIN');
  });

  it('should move an early segment later in the message using moveSegmentAfter', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const obr = hl7.getSegment('OBR');
    const nte = hl7.getSegment('NTE');

    expect(obr).toBeDefined();
    expect(nte).toBeDefined();
    if (!obr || !nte) throw new Error('Expected OBR and NTE segments to be defined');

    hl7.moveSegmentAfter(obr, nte);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBX', 'OBX', 'NTE', 'OBR', 'DG1']);
  });

  it('should move the final segment closer to the front using moveSegmentBefore', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const dg1 = hl7.getSegment('DG1');
    const pid = hl7.getSegment('PID');

    expect(dg1).toBeDefined();
    expect(pid).toBeDefined();
    if (!dg1 || !pid) throw new Error('Expected DG1 and PID segments to be defined');

    hl7.moveSegmentBefore(dg1, pid);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'DG1', 'PID', 'OBR', 'OBX', 'OBX', 'NTE']);
  });

  it('should remove multiple non-consecutive segments in a single deleteSegments call', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const pid = hl7.getSegment('PID');
    const dg1 = hl7.getSegment('DG1');

    expect(pid).toBeDefined();
    expect(dg1).toBeDefined();
    if (!pid || !dg1) throw new Error('Expected PID and DG1 segments to be defined');

    hl7.deleteSegments([pid, dg1]);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'OBR', 'OBX', 'OBX', 'NTE']);
  });

  it('should parse messages containing mixed CR and CRLF segment terminators', () => {
    const raw =
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID11|P|2.3\r' +
      'PID|1||12345^^^MRN||DOE^JOHN\r\n' +
      'OBR|1||ORDER1|TEST^Panel\r' +
      'OBX|1|TX|CODE1^Result||Alpha';
    const hl7 = new HL7(raw);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'OBX']);
  });

  it('should round-trip segments that contain trailing empty fields', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID12|P|2.3',
      'OBX|1|TX|CODE1^Result||Alpha|',
    ]);
    const hl7 = new HL7(raw);
    const obx = hl7.getSegment('OBX');

    expect(obx).toBeDefined();
    if (!obx) throw new Error('Expected OBX segment to be defined');

    expect(obx.get('OBX.6')).toBe('');
    expect(hl7.build()).toBe(raw);
  });

  it('should skip unrelated intervening segments before matching consecutive group in getSegmentsAfter', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID14|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'OBR|1||ORDER1|TEST^Panel',
      'NTE|1|L|Order note before observations',
      'OBX|1|TX|CODE1^Result||Alpha',
      'OBX|2|TX|CODE2^Result||Beta',
      'NTE|2|L|Order note after observations',
    ]);
    const hl7 = new HL7(raw);
    const obr = hl7.getSegment('OBR');

    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    // Consecutive mode operates in two phases:
    // 1. Skips preceding unrelated segments (e.g. NTE|1) until the first target match ('OBX') is encountered.
    // 2. Collects contiguous target segments until a non-matching segment appears (e.g. NTE|2), then strictly terminates.
    expect(
      hl7.getSegmentsAfter(obr, 'OBX', [], true).map((segment) => segment.get('OBX.1')),
    ).toEqual(['1', '2']);
  });

  it('should reject malformed lowercase segment identifiers during transform', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID15|P|2.3',
      'pid|1||12345^^^MRN||DOE^JOHN',
    ]);

    expect(() => new HL7(raw)).toThrow(/Invalid segment: pid\|1\|\|12345\^\^\^MRN\|\|DOE\^JOHN/);
  });

  it('should reject parse options that conflict with actual message delimiters', () => {
    expect(() => new HL7(createAsteriskDelimitedMessage(), { fieldDelim: '|' })).toThrow(
      /Invalid segment: MSH\*\^~\\&\*SEND\*FAC\*RECV\*RFAC\*202401011300\*\*ORU\^R01\*MSGID3\*P\*2\.3/,
    );
  });
});

describe('Advanced Segment Hierarchy Mutations', () => {
  it('should return null for unpopulated field, component, and repetition coordinates', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const segment = hl7.getSegment('ZYX');

    expect(segment).toBeDefined();
    if (!segment) throw new Error('Expected ZYX segment to be defined');

    expect(segment.get('ZYX.9')).toBeNull();
    expect(segment.get('ZYX.5.9')).toBeNull();
    expect(segment.get('ZYX.5.1', 9)).toBeNull();
  });

  it('should set higher repetition index directly and serialize intermediate empty repeats', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.3', 'THIRD', 2);

    expect(segment.get('ABC.3', 2)).toBe('THIRD');
    expect(segment.get('ABC.3', true)).toBe('~~THIRD');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC|||~~THIRD');
  });

  it('should set higher component index directly and serialize intermediate empty components', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.4.3', 'TAIL');

    expect(segment.get('ABC.4.3')).toBe('TAIL');
    expect(segment.get('ABC.4', true, true)).toBe('^^TAIL');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC||||^^TAIL');
  });

  it('should preserve an explicitly assigned empty string on a newly created field', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.2', '');

    expect(segment.get('ABC.2')).toBe('');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC||');
  });

  it('should overwrite existing component values in place upon repeated set calls', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.2', 'FIRST');
    segment.set('ABC.5.2', 'SECOND');

    expect(segment.get('ABC.5.2')).toBe('SECOND');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC|||||^SECOND');
  });

  it('should ensure newly created segment instances maintain independent state', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const first = hl7.createSegment('ZAA');
    const second = hl7.createSegment('ZAA');

    first.set('ZAA.1', 'FIRST');
    second.set('ZAA.1', 'SECOND');

    expect(first).not.toBe(second);
    expect(hl7.getSegments('ZAA')).toHaveLength(2);
    expect(hl7.getSegments('ZAA')[0]?.get('ZAA.1')).toBe('FIRST');
    expect(hl7.getSegments('ZAA')[1]?.get('ZAA.1')).toBe('SECOND');
  });

  it('should replace all prior repetitions when bulk overwrite repeatingIndex is true', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.1', 'FIRST', 0, 0);
    segment.set('ABC.5.1', 'SECOND', 1, 0);
    segment.set('ABC.5.1', 'ONLY', true, true);

    expect(segment.get('ABC.5', true)).toBe('ONLY');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC|||||ONLY');
  });

  it('should replace prior subcomponents when bulk overwrite subComponentIndex is true', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.1', 'LEFT', 0, 0);
    segment.set('ABC.5.1', 'RIGHT', 0, 1);
    segment.set('ABC.5.1', 'WHOLE', 0, true);

    expect(segment.get('ABC.5.1', 0, true)).toBe('WHOLE');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC|||||WHOLE');
  });

  it('should append new repetitions to parsed segments without disrupting existing repetitions', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const segment = hl7.getSegment('ZYX');

    expect(segment).toBeDefined();
    if (!segment) throw new Error('Expected ZYX segment to be defined');

    segment.set('ZYX.5.1', 'Repeat5', 4, 0);

    expect(segment.get('ZYX.5.1', 4)).toBe('Repeat5');
    expect(segment.get('ZYX.5', true) ?? '').toMatch(/~Repeat5$/);
  });

  it('should return null when navigating beyond present subcomponent bounds', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const segment = hl7.getSegment('ZYX');

    expect(segment).toBeDefined();
    if (!segment) throw new Error('Expected ZYX segment to be defined');

    expect(segment.get('ZYX.5.1', 2, 9)).toBeNull();
  });

  it('should reject invalid set field paths containing too many dotted segments', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    expect(() => segment.set('ABC.1.1.1', 'VALUE')).toThrow(/Invalid parameter: 'field'/);
  });

  it('should preserve strict getSegments() ordering guarantee across sequential create, move, and delete mutations', () => {
    const hl7 = new HL7(createDiagnosticReportMessage());
    const msh = hl7.getSegment('MSH');
    const pid = hl7.getSegment('PID');
    const nte = hl7.getSegment('NTE');
    const obxList = hl7.getSegments('OBX');

    expect(msh).toBeDefined();
    expect(pid).toBeDefined();
    expect(nte).toBeDefined();
    expect(obxList).toHaveLength(2);
    if (!msh || !pid || !nte) throw new Error('Expected segments to be defined');

    // 1. Initial order
    expect(hl7.getSegments().map((s) => s.type)).toEqual([
      'MSH',
      'PID',
      'OBR',
      'OBX',
      'OBX',
      'NTE',
      'DG1',
    ]);

    // 2. Insert EVN after MSH
    hl7.createSegmentAfter('EVN', msh);
    expect(hl7.getSegments().map((s) => s.type)).toEqual([
      'MSH',
      'EVN',
      'PID',
      'OBR',
      'OBX',
      'OBX',
      'NTE',
      'DG1',
    ]);

    // 3. Move PID after NTE
    hl7.moveSegmentAfter(pid, nte);
    expect(hl7.getSegments().map((s) => s.type)).toEqual([
      'MSH',
      'EVN',
      'OBR',
      'OBX',
      'OBX',
      'NTE',
      'PID',
      'DG1',
    ]);

    // 4. Delete both OBX segments
    hl7.deleteSegments(obxList);
    expect(hl7.getSegments().map((s) => s.type)).toEqual([
      'MSH',
      'EVN',
      'OBR',
      'NTE',
      'PID',
      'DG1',
    ]);

    // 5. Verification: build() mirrors the exact doubly-linked list traversal
    const builtLines = hl7
      .build()
      .split('\r')
      .map((line) => line.slice(0, 3));
    expect(builtLines).toEqual(['MSH', 'EVN', 'OBR', 'NTE', 'PID', 'DG1']);
  });

  it('should throw when deleteSegments receives duplicate references to the same segment', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const obr = hl7.getSegment('OBR');

    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    expect(() => hl7.deleteSegments([obr, obr])).toThrow(/Failed to locate: 'segment'/);
  });

  it('should successfully insert new segment immediately after MSH using createSegmentAfter', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const msh = hl7.getSegment('MSH');

    expect(msh).toBeDefined();
    if (!msh) throw new Error('Expected MSH segment to be defined');

    const evn = hl7.createSegmentAfter('EVN', msh);
    evn.set('EVN.1', 'A01');

    const segments = hl7.getSegments();
    expect(segments[0]?.type).toBe('MSH');
    expect(segments[1]?.type).toBe('EVN');
    expect(segments[1]?.get('EVN.1')).toBe('A01');
    expect(segments[2]?.type).toBe('PID');
  });

  it('should reset linked list to original raw message if transform() is explicitly re-invoked', () => {
    const raw = createStandardOruMessage();
    const hl7 = new HL7(raw);

    // Mutate by creating a new segment
    const zds = hl7.createSegment('ZDS');
    zds.set('ZDS.1', '12345');
    expect(hl7.getSegment('ZDS')).toBeDefined();

    // Explicitly re-invoking transform() re-parses from this.raw
    hl7.transform();
    expect(hl7.getSegment('ZDS')).toBeNull();
    expect(hl7.build()).toBe(raw);
  });
});
