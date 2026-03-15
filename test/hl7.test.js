import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HL7 } from '../dist/index.js';

function joinSegments(segments, eol = '\r') {
  return segments.join(eol);
}

function makeOruMessage() {
  return joinSegments([
    'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID1|P|2.3',
    'PID|1||12345^^^MRN||DOE^JOHN',
    'OBR|1||ORDER1|TEST^Panel',
    'OBX|1|TX|CODE1^Result||Alpha',
    'OBX|2|TX|CODE2^Result||Beta',
    'NTE|1|L|Observation note',
    'DG1|1||A00^Diagnosis'
  ]);
}

function makeAdtMessage() {
  return joinSegments([
    'MSH|^~\\&|ADTAPP|ADTFAC|RECVAPP|RECVFAC|202401011245||ADT^A01|MSGID2|P|2.3',
    'PID|1||12345^^^MRN||DOE^JOHN',
    'PV1|1|I|WARD^101^1'
  ]);
}

function makeCustomDelimitedMessage() {
  return ['MSH*^~\\&*SEND*FAC*RECV*RFAC*202401011300**ORU^R01*MSGID3*P*2.3', 'PID*1**12345^^^MRN**DOE^JANE'].join('\n');
}

function segmentTypes(hl7) {
  return hl7.getSegments().map((segment) => segment.type);
}

describe('HL7 construction and parsing', () => {
  test('parses a standard ORU message and preserves segment order', () => {
    const hl7 = new HL7(makeOruMessage());

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'NTE', 'DG1']);
    assert.equal(hl7.getSegment('PID')?.type, 'PID');
    assert.equal(hl7.getSegments('OBX').length, 2);
  });

  test('parses messages containing numeric segment types', () => {
    const hl7 = new HL7(makeAdtMessage());

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'PV1']);
    assert.equal(hl7.getSegment('PV1')?.type, 'PV1');
  });

  test('ignores trailing blank lines during transform', () => {
    const raw = `${makeOruMessage()}\r\r`;
    const hl7 = new HL7(raw);

    assert.equal(hl7.getSegments().length, 7);
  });

  test('transform is idempotent and does not duplicate segments', () => {
    const hl7 = new HL7(makeOruMessage());
    const before = hl7.getSegments().length;

    hl7.transform();
    hl7.transform();

    assert.equal(before, 7);
    assert.equal(hl7.getSegments().length, 7);
  });

  test('supports custom delimiters for parsing and building', () => {
    const hl7 = new HL7(makeCustomDelimitedMessage(), {
      fieldDelim: '*',
      eolDelim: '\n',
      buildEolChar: '\n'
    });

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID']);
    assert.equal(hl7.getSegment('PID')?.type, 'PID');
    assert.match(hl7.build(), /^MSH\*/);
    assert.match(hl7.build(), /\nPID\*/);
  });

  test('throws for invalid constructor inputs', () => {
    assert.throws(() => new HL7(null), /Invalid raw HL7 message/);
    assert.throws(() => new HL7('PID|1||123'), /Invalid raw HL7 message/);
    assert.throws(() => new HL7(makeOruMessage(), { fieldDelim: '||' }), /Invalid field delimiter/);
    assert.throws(() => new HL7(makeOruMessage(), { eolDelim: '\t' }), /Invalid EOL character/);
  });
});

describe('HL7 traversal and selection', () => {
  test('getSegment and getSegments validate type input', () => {
    const hl7 = new HL7(makeOruMessage());

    assert.throws(() => hl7.getSegment('PID.3'), /Invalid parameter: 'type'/);
    assert.throws(() => hl7.getSegments('PID.3'), /Invalid parameter: 'type'/);
  });

  test('getSegmentsAfter returns all matching segments after a start segment until a stop type', () => {
    const hl7 = new HL7(makeOruMessage());
    const obr = hl7.getSegment('OBR');

    assert.ok(obr);
    assert.deepEqual(
      hl7.getSegmentsAfter(obr, 'OBX', ['NTE']).map((segment) => segment.type),
      ['OBX', 'OBX']
    );
  });

  test('getSegmentsAfter respects consecutive mode', () => {
    const hl7 = new HL7(makeOruMessage());
    const obr = hl7.getSegment('OBR');

    assert.ok(obr);
    assert.deepEqual(
      hl7.getSegmentsAfter(obr, 'OBX', [], true).map((segment) => segment.type),
      ['OBX', 'OBX']
    );
  });

  test('getSegmentsAfter throws for invalid input and foreign segments', () => {
    const hl7 = new HL7(makeOruMessage());
    const other = new HL7(makeAdtMessage());
    const foreignSegment = other.getSegment('PV1');

    assert.ok(foreignSegment);
    assert.throws(() => hl7.getSegmentsAfter(null, 'OBX'), /Invalid parameter: 'startSegment'/);
    assert.throws(() => hl7.getSegmentsAfter(hl7.getSegment('OBR'), 'OBX', 'NTE'), /Invalid parameter: 'stopSegmentType'/);
    assert.throws(() => hl7.getSegmentsAfter(hl7.getSegment('OBR'), 'OBX', [], 'yes'), /Invalid parameter: 'consecutive'/);
    assert.throws(() => hl7.getSegmentsAfter(foreignSegment, 'OBX'), /Failed to locate: 'startSegment'/);
  });
});

describe('HL7 mutation operations', () => {
  test('createSegment appends to the end of the message', () => {
    const hl7 = new HL7(makeOruMessage());

    hl7.createSegment('AL1');

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'NTE', 'DG1', 'AL1']);
  });

  test('createSegmentAfter inserts directly after the target segment', () => {
    const hl7 = new HL7(makeOruMessage());
    const obr = hl7.getSegment('OBR');

    assert.ok(obr);
    hl7.createSegmentAfter('NTE', obr);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'NTE', 'OBX', 'OBX', 'NTE', 'DG1']);
  });

  test('createSegmentBefore inserts directly before the target segment', () => {
    const hl7 = new HL7(makeOruMessage());
    const obr = hl7.getSegment('OBR');

    assert.ok(obr);
    hl7.createSegmentBefore('NTE', obr);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'NTE', 'OBR', 'OBX', 'OBX', 'NTE', 'DG1']);
  });

  test('createSegmentAfter and createSegmentBefore reject invalid or foreign targets', () => {
    const hl7 = new HL7(makeOruMessage());
    const other = new HL7(makeAdtMessage());
    const foreignSegment = other.getSegment('PV1');

    assert.ok(foreignSegment);
    assert.throws(() => hl7.createSegmentAfter('NTE', null), /Invalid parameter: 'targetSegment'/);
    assert.throws(() => hl7.createSegmentBefore('NTE', null), /Invalid parameter: 'targetSegment'/);
    assert.throws(() => hl7.createSegmentAfter('NTE', foreignSegment), /Failed to locate: 'targetSegment'/);
    assert.throws(() => hl7.createSegmentBefore('NTE', foreignSegment), /Failed to locate: 'targetSegment'/);
  });

  test('deleteSegment removes a single located segment', () => {
    const hl7 = new HL7(makeOruMessage());
    const note = hl7.getSegment('NTE');

    assert.ok(note);
    hl7.deleteSegment(note);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'DG1']);
  });

  test('deleteSegments removes multiple located segments', () => {
    const hl7 = new HL7(makeOruMessage());
    const obxSegments = hl7.getSegments('OBX');

    hl7.deleteSegments(obxSegments);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'NTE', 'DG1']);
  });

  test('deleteSegment and deleteSegments reject foreign, missing or invalid segments', () => {
    const hl7 = new HL7(makeOruMessage());
    const other = new HL7(makeAdtMessage());
    const foreignSegment = other.getSegment('PV1');
    const note = hl7.getSegment('NTE');

    assert.ok(foreignSegment);
    assert.ok(note);
    hl7.deleteSegment(note);

    assert.throws(() => hl7.deleteSegment(note), /Failed to locate: 'segment'/);
    assert.throws(() => hl7.deleteSegment(foreignSegment), /Failed to locate: 'segment'/);
    assert.throws(() => hl7.deleteSegments([null]), /Invalid parameter: 'segments'/);
  });

  test('moveSegmentAfter reorders segments', () => {
    const hl7 = new HL7(makeOruMessage());
    const note = hl7.getSegment('NTE');
    const pid = hl7.getSegment('PID');

    assert.ok(note);
    assert.ok(pid);
    hl7.moveSegmentAfter(note, pid);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'NTE', 'OBR', 'OBX', 'OBX', 'DG1']);
  });

  test('moveSegmentBefore reorders segments', () => {
    const hl7 = new HL7(makeOruMessage());
    const note = hl7.getSegment('NTE');
    const obr = hl7.getSegment('OBR');

    assert.ok(note);
    assert.ok(obr);
    hl7.moveSegmentBefore(note, obr);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'NTE', 'OBR', 'OBX', 'OBX', 'DG1']);
  });

  test('move operations reject invalid and foreign segments', () => {
    const hl7 = new HL7(makeOruMessage());
    const other = new HL7(makeAdtMessage());
    const pid = hl7.getSegment('PID');
    const foreignSegment = other.getSegment('PV1');

    assert.ok(pid);
    assert.ok(foreignSegment);
    assert.throws(() => hl7.moveSegmentAfter(null, pid), /Invalid parameter: 'segment'/);
    assert.throws(() => hl7.moveSegmentBefore(pid, null), /Invalid parameter: 'targetSegment'/);
    assert.throws(() => hl7.moveSegmentAfter(foreignSegment, pid), /Failed to locate: 'segment'/);
    assert.throws(() => hl7.moveSegmentBefore(pid, foreignSegment), /Failed to locate: 'targetSegment'/);
  });
});

describe('HL7 reindexing and build behavior', () => {
  test('reindexSegments updates indexes using reset rules', () => {
    const hl7 = new HL7(makeOruMessage());

    hl7.reindexSegments({ OBR: [], OBX: ['OBR'], NTE: ['OBR', 'OBX'] });

    assert.match(hl7.build(), /OBR\|1\|/);
    assert.match(hl7.build(), /OBX\|1\|TX\|CODE1/);
    assert.match(hl7.build(), /OBX\|2\|TX\|CODE2/);
    assert.match(hl7.build(), /NTE\|1\|L\|Observation note/);
  });

  test('reindexSegments supports a custom start index and field', () => {
    const hl7 = new HL7(makeOruMessage());

    hl7.reindexSegments({ OBX: [] }, 10, '2');

    const obxSegments = hl7.getSegments('OBX');

    assert.equal(obxSegments[0].data[2][0][1][0], '10');
    assert.equal(obxSegments[1].data[2][0][1][0], '11');
  });

  test('reindexSegments rejects invalid inputs', () => {
    const hl7 = new HL7(makeOruMessage());

    assert.throws(() => hl7.reindexSegments(null), /Invalid parameter: 'reindexConfig'/);
    assert.throws(() => hl7.reindexSegments({ OBX: 'OBR' }), /Invalid parameter: 'reindexConfig'/);
    assert.throws(() => hl7.reindexSegments({ OBX: [] }, 0), /Invalid parameter: 'startIndex'/);
    assert.throws(() => hl7.reindexSegments({ OBX: [] }, 1, '1.1.1'), /Invalid parameter: 'field'/);
  });

  test('build uses canonical carriage return as the default segment terminator', () => {
    const hl7 = new HL7(makeOruMessage());
    const built = hl7.build();

    assert.match(built, /\rPID\|/);
    assert.doesNotMatch(built, /\r\nPID\|/);
  });
});
