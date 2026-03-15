import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HL7 } from '../dist/index.js';

function joinSegments(segments, eol = '\r') {
  return segments.join(eol);
}

function makeBaseMessage() {
  return joinSegments([
    'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID1|P|2.3',
    'PID|1||12345^^^MRN||DOE^JOHN',
    'OBR|1||ORDER1|TEST^Panel',
    'OBX|1|TX|CODE1^Result||Alpha',
    'NTE|1|L|Observation note',
    'OBX|2|TX|CODE2^Result||Beta'
  ]);
}

function segmentTypes(hl7) {
  return hl7.getSegments().map((segment) => segment.type);
}

describe('Regression and edge-case coverage', () => {
  test('getSegments without a type returns all segments in order', () => {
    const hl7 = new HL7(makeBaseMessage());

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX', 'NTE', 'OBX']);
  });

  test('build round-trips a parsed message using the configured EOL', () => {
    const raw = makeBaseMessage();
    const hl7 = new HL7(raw);
    const rebuilt = hl7.build();

    assert.equal(rebuilt, raw);
  });

  test('custom buildEolChar is respected during serialization', () => {
    const hl7 = new HL7(makeBaseMessage(), { buildEolChar: '\n' });
    const built = hl7.build();

    assert.match(built, /\nPID\|/);
    assert.doesNotMatch(built, /\rPID\|/);
  });

  test('createSegment rejects invalid types', () => {
    const hl7 = new HL7(makeBaseMessage());

    assert.throws(() => hl7.createSegment('AB'), /Invalid parameter: 'type'/);
    assert.throws(() => hl7.createSegment('ABCD'), /Invalid parameter: 'type'/);
    assert.throws(() => hl7.createSegment('OBX.1'), /Invalid parameter: 'type'/);
  });

  test('move operations are stable no-ops when source and target are the same segment', () => {
    const hl7 = new HL7(makeBaseMessage());
    const obx = hl7.getSegment('OBX');

    assert.ok(obx);
    hl7.moveSegmentAfter(obx, obx);
    hl7.moveSegmentBefore(obx, obx);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX', 'NTE', 'OBX']);
  });

  test('deleteSegments accepts an empty array without mutating the message', () => {
    const hl7 = new HL7(makeBaseMessage());

    hl7.deleteSegments([]);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX', 'NTE', 'OBX']);
  });

  test('getSegmentsAfter with consecutive mode stops at the first non-match after matches begin', () => {
    const hl7 = new HL7(makeBaseMessage());
    const obr = hl7.getSegment('OBR');

    assert.ok(obr);
    assert.deepEqual(
      hl7.getSegmentsAfter(obr, 'OBX', [], true).map((segment) => segment.get('OBX')),
      ['OBX|1|TX|CODE1^Result||Alpha']
    );
  });

  test('invalid segment lines should be rejected during transform', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID1|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'bad line that is not an HL7 segment'
    ]);

    assert.throws(() => new HL7(raw), /Invalid segment: bad line that is not an HL7 segment/);
  });
});
