import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HL7 } from '../dist/index.js';

function joinSegments(segments, eol = '\r') {
  return segments.join(eol);
}

function makeSegmentMessage() {
  return joinSegments([
    'MSH|^~\\&|SEND|SFAC|RECV|RFAC|202401011230||ORU^R01|MSGID1|P|2.3',
    'ZYX|1|A|B|C|Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3',
    'PID|1||12345^^^MRN||DOE^JOHN^A',
  ]);
}

function makeBaseMessage() {
  return joinSegments([
    'MSH|^~\\&|SEND|SFAC|RECV|RFAC|202401011230||ADT^A01|MSGID2|P|2.3',
    'PID|1||12345^^^MRN||DOE^JOHN',
  ]);
}

function getLastSegmentLine(hl7) {
  return hl7.build().split(hl7.parseOptions.buildEolChar).at(-1);
}

describe('Segment access behavior', () => {
  test('returns the full segment string when addressed by segment and both repeating index and sub component index is true', () => {
    const hl7 = new HL7(makeSegmentMessage());
    const segment = hl7.getSegment('ZYX');

    assert.ok(segment);
    assert.equal(
      segment.get('ZYX', true, true),
      'ZYX|1|A|B|C|Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3',
    );
  });

  test('returns field, component, repeat and subcomponent values from valid dotted paths', () => {
    const hl7 = new HL7(makeSegmentMessage());
    const segment = hl7.getSegment('ZYX');

    assert.ok(segment);
    assert.equal(segment.get('ZYX.5'), 'Repeat1');
    assert.equal(
      segment.get('ZYX.5', true),
      'Repeat1~Component1^Component2~SubComp1^Component2~Repeat3',
    );
    assert.equal(segment.get('ZYX.5.1', 1), 'Component1');
    assert.equal(segment.get('ZYX.5.2', 1), 'Component2');
    assert.equal(segment.get('ZYX.5.1', 2), 'SubComp1');
    assert.equal(segment.get('ZYX.5.1', 2, 1), 'SubComp2');
    assert.equal(segment.get('ZYX.5.1', 2, true), 'SubComp1&SubComp2');
  });

  test('throws for invalid field input and invalid indexes', () => {
    const hl7 = new HL7(makeSegmentMessage());
    const segment = hl7.getSegment('ZYX');

    assert.ok(segment);
    assert.throws(() => segment.get(''), /Invalid parameter: 'field'/);
    assert.throws(() => segment.get('PID'), /Cannot get/);
    assert.throws(() => segment.get('ZYX', -1), /Invalid parameter: 'repeatingIndex'/);
    assert.throws(() => segment.get('ZYX', 0, -1), /Invalid parameter: 'subComponentIndex'/);
    assert.throws(() => segment.get('ZYX', false), /Invalid parameter: 'repeatingIndex'/);
  });
});

describe('Segment mutation through set', () => {
  test('sets a simple field value on a newly created segment', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.1', 'VALUE');

    assert.equal(segment.data[1][0][1][0], 'VALUE');
    assert.equal(getLastSegmentLine(hl7), 'ABC|VALUE');
    assert.equal(hl7.getSegment('ABC'), segment);
  });

  test('sets repeated, component and subcomponent values while expanding missing structure', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.1', 'COMP1', 1, 0);
    segment.set('ABC.5.2', 'COMP2', 1, 0);
    segment.set('ABC.5.1', 'SUB1', 2, 0);
    segment.set('ABC.5.1', 'SUB2', 2, 1);

    assert.equal(segment.data[5][1][1][0], 'COMP1');
    assert.equal(segment.data[5][1][2][0], 'COMP2');
    assert.equal(segment.data[5][2][1][0], 'SUB1');
    assert.equal(segment.data[5][2][1][1], 'SUB2');
    assert.equal(getLastSegmentLine(hl7), 'ABC|||||~COMP1^COMP2~SUB1&SUB2');
  });

  test('supports true indexes for bulk overwrite behavior', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.2.1', 'WHOLE', true, true);

    assert.equal(segment.data[2][0][1][0], 'WHOLE');
    assert.equal(getLastSegmentLine(hl7), 'ABC||WHOLE');
  });

  test('allows mutation of parsed segments and reflects changes in build output', () => {
    const hl7 = new HL7(makeSegmentMessage());
    const pid = hl7.getSegment('PID');

    assert.ok(pid);
    pid.set('PID.5.1', 'SMITH');
    pid.set('PID.5.2', 'JANE');

    const built = hl7.build();

    assert.match(built, /PID\|1\|\|12345\^\^\^MRN\|\|SMITH\^JANE\^A/);
  });

  test('throws for invalid set parameters', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    assert.throws(() => segment.set('', 'VALUE'), /Invalid parameter: 'field'/);
    assert.throws(() => segment.set('PID.1', 'VALUE'), /Cannot set/);
    assert.throws(() => segment.set('ABC.1', null), /Invalid parameter: 'value'/);
    assert.throws(() => segment.set('ABC.1', 'VALUE', -1), /Invalid parameter: 'repeatingIndex'/);
    assert.throws(
      () => segment.set('ABC.1', 'VALUE', 0, -1),
      /Invalid parameter: 'subComponentIndex'/,
    );
    assert.throws(
      () => segment.set('ABC.1', 'VALUE', false),
      /Invalid parameter: 'repeatingIndex'/,
    );
  });
});
