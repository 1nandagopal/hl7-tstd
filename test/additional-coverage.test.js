import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HL7 } from '../dist/index.js';
import {
  getLastSegmentLine,
  joinSegments,
  makeBaseMessage,
  makeCustomDelimitedMessage,
  makeOruMessage,
  makeSegmentMessage,
  segmentTypes,
} from './helpers.js';

describe('Additional HL7 coverage', () => {
  test('returns null or an empty array for segment types that are not present', () => {
    const hl7 = new HL7(makeOruMessage());

    assert.equal(hl7.getSegment('AL1'), null);
    assert.deepEqual(hl7.getSegments('AL1'), []);
  });

  test('parses repeated patient identifiers and supports selecting later repetitions', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ADT^A01|MSGID7|P|2.3',
      'PID|1||12345^^^MRN~67890^^^NHS||DOE^JOHN',
    ]);
    const hl7 = new HL7(raw);
    const pid = hl7.getSegment('PID');

    assert.ok(pid);
    assert.equal(pid.get('PID.3'), '12345^^^MRN');
    assert.equal(pid.get('PID.3', true), '12345^^^MRN~67890^^^NHS');
    assert.equal(pid.get('PID.3.1', 1), '67890');
    assert.equal(pid.get('PID.3.4', 1), 'NHS');
  });

  test('getSegmentsAfter returns an empty array when the start segment is already the last segment', () => {
    const hl7 = new HL7(makeOruMessage());
    const dg1 = hl7.getSegment('DG1');

    assert.ok(dg1);
    assert.deepEqual(hl7.getSegmentsAfter(dg1, 'OBX'), []);
  });

  test('createSegmentAfter appends when the target is the current tail segment', () => {
    const hl7 = new HL7(makeOruMessage());
    const dg1 = hl7.getSegment('DG1');

    assert.ok(dg1);
    const al1 = hl7.createSegmentAfter('AL1', dg1);
    al1.set('AL1.3', 'PENICILLIN');

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX', 'OBX', 'NTE', 'DG1', 'AL1']);
    assert.match(hl7.build(), /AL1\|\|\|PENICILLIN$/);
  });

  test('moveSegmentAfter can move an early segment later in the message', () => {
    const hl7 = new HL7(makeOruMessage());
    const obr = hl7.getSegment('OBR');
    const nte = hl7.getSegment('NTE');

    assert.ok(obr);
    assert.ok(nte);
    hl7.moveSegmentAfter(obr, nte);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBX', 'OBX', 'NTE', 'OBR', 'DG1']);
  });

  test('moveSegmentBefore can move the last segment closer to the front', () => {
    const hl7 = new HL7(makeOruMessage());
    const dg1 = hl7.getSegment('DG1');
    const pid = hl7.getSegment('PID');

    assert.ok(dg1);
    assert.ok(pid);
    hl7.moveSegmentBefore(dg1, pid);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'DG1', 'PID', 'OBR', 'OBX', 'OBX', 'NTE']);
  });

  test('deleteSegments can remove separated segments in one call', () => {
    const hl7 = new HL7(makeOruMessage());
    const pid = hl7.getSegment('PID');
    const dg1 = hl7.getSegment('DG1');

    assert.ok(pid);
    assert.ok(dg1);
    hl7.deleteSegments([pid, dg1]);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'OBR', 'OBX', 'OBX', 'NTE']);
  });

  test('parses messages containing mixed carriage-return and CRLF segment terminators', () => {
    const raw =
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID11|P|2.3\r' +
      'PID|1||12345^^^MRN||DOE^JOHN\r\n' +
      'OBR|1||ORDER1|TEST^Panel\r' +
      'OBX|1|TX|CODE1^Result||Alpha';
    const hl7 = new HL7(raw);

    assert.deepEqual(segmentTypes(hl7), ['MSH', 'PID', 'OBR', 'OBX']);
  });

  test('round-trips segments that contain trailing empty fields', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID12|P|2.3',
      'OBX|1|TX|CODE1^Result||Alpha|',
    ]);
    const hl7 = new HL7(raw);
    const obx = hl7.getSegment('OBX');

    assert.ok(obx);
    assert.equal(obx.get('OBX.6'), '');
    assert.equal(hl7.build(), raw);
  });

  test('consecutive selection can skip unrelated segments before the first matching group', () => {
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

    assert.ok(obr);
    assert.deepEqual(
      hl7.getSegmentsAfter(obr, 'OBX', [], true).map((segment) => segment.get('OBX.1')),
      ['1', '2'],
    );
  });

  test('rejects malformed lowercase segment identifiers', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID15|P|2.3',
      'pid|1||12345^^^MRN||DOE^JOHN',
    ]);

    assert.throws(() => new HL7(raw), /Invalid segment: pid\|1\|\|12345\^\^\^MRN\|\|DOE\^JOHN/);
  });

  test('rejects explicit parse options that do not match the actual message delimiter', () => {
    assert.throws(
      () => new HL7(makeCustomDelimitedMessage(), { fieldDelim: '|' }),
      /Invalid segment: MSH\*\^~\\&\*SEND\*FAC\*RECV\*RFAC\*202401011300\*\*ORU\^R01\*MSGID3\*P\*2\.3/,
    );
  });
});

describe('Additional segment mutation coverage', () => {
  test('returns null for missing field, component and repetition paths', () => {
    const hl7 = new HL7(makeSegmentMessage());
    const segment = hl7.getSegment('ZYX');

    assert.ok(segment);
    assert.equal(segment.get('ZYX.9'), null);
    assert.equal(segment.get('ZYX.5.9'), null);
    assert.equal(segment.get('ZYX.5.1', 9), null);
  });

  test('can set a later repetition directly and serialize missing repetitions as placeholders', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.3', 'THIRD', 2);

    assert.equal(segment.get('ABC.3', 2), 'THIRD');
    assert.equal(segment.get('ABC.3', true), '~~THIRD');
    assert.equal(getLastSegmentLine(hl7), 'ABC|||~~THIRD');
  });

  test('can set a later component directly and serialize missing components as placeholders', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.4.3', 'TAIL');

    assert.equal(segment.get('ABC.4.3'), 'TAIL');
    assert.equal(segment.get('ABC.4', true, true), '^^TAIL');
    assert.equal(getLastSegmentLine(hl7), 'ABC||||^^TAIL');
  });

  test('preserves an explicitly assigned empty string on a created field', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.2', '');

    assert.equal(segment.get('ABC.2'), '');
    assert.equal(getLastSegmentLine(hl7), 'ABC||');
  });

  test('overwrites a previously set component value in place', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.2', 'FIRST');
    segment.set('ABC.5.2', 'SECOND');

    assert.equal(segment.get('ABC.5.2'), 'SECOND');
    assert.equal(getLastSegmentLine(hl7), 'ABC|||||^SECOND');
  });

  test('newly created segment instances are writable and independently retrievable', () => {
    const hl7 = new HL7(makeBaseMessage());
    const first = hl7.createSegment('ZAA');
    const second = hl7.createSegment('ZAA');

    first.set('ZAA.1', 'FIRST');
    second.set('ZAA.1', 'SECOND');

    assert.notEqual(first, second);
    assert.equal(hl7.getSegments('ZAA').length, 2);
    assert.equal(hl7.getSegments('ZAA')[0]?.get('ZAA.1'), 'FIRST');
    assert.equal(hl7.getSegments('ZAA')[1]?.get('ZAA.1'), 'SECOND');
  });

  test('bulk overwrite with repeatingIndex true replaces all prior repetitions for a field', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.1', 'FIRST', 0, 0);
    segment.set('ABC.5.1', 'SECOND', 1, 0);
    segment.set('ABC.5.1', 'ONLY', true, true);

    assert.equal(segment.get('ABC.5', true), 'ONLY');
    assert.equal(getLastSegmentLine(hl7), 'ABC|||||ONLY');
  });

  test('bulk overwrite with subComponentIndex true replaces prior subcomponents for a component', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.1', 'LEFT', 0, 0);
    segment.set('ABC.5.1', 'RIGHT', 0, 1);
    segment.set('ABC.5.1', 'WHOLE', 0, true);

    assert.equal(segment.get('ABC.5.1', 0, true), 'WHOLE');
    assert.equal(getLastSegmentLine(hl7), 'ABC|||||WHOLE');
  });

  test('extends a parsed repeating field without disturbing existing repetitions', () => {
    const hl7 = new HL7(makeSegmentMessage());
    const segment = hl7.getSegment('ZYX');

    assert.ok(segment);
    segment.set('ZYX.5.1', 'Repeat5', 4, 0);

    assert.equal(segment.get('ZYX.5.1', 4), 'Repeat5');
    assert.match(segment.get('ZYX.5', true), /~Repeat5$/);
  });

  test('returns null when reading beyond a present field with too many subcomponents requested', () => {
    const hl7 = new HL7(makeSegmentMessage());
    const segment = hl7.getSegment('ZYX');

    assert.ok(segment);
    assert.equal(segment.get('ZYX.5.1', 2, 9), null);
  });

  test('rejects invalid set field paths that contain too many dotted indexes', () => {
    const hl7 = new HL7(makeBaseMessage());
    const segment = hl7.createSegment('ABC');

    assert.throws(() => segment.set('ABC.1.1.1', 'VALUE'), /Invalid parameter: 'field'/);
  });
});
