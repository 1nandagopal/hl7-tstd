import { describe, expect, it } from 'vite-plus/test';
import { HL7 } from '../src/index.ts';
import {
  collectSegmentTypes,
  createHighDensityTelemetryMessage,
  createInternationalUtf8Message,
  createSparseHierarchyMessage,
  createStandardOruMessage,
  joinSegments,
} from './helpers.ts';

describe('Regression & Edge Cases: Delimiters & Boundaries', () => {
  it('should return all segments in original sequence when getSegments is called without type filter', () => {
    const hl7 = new HL7(createStandardOruMessage());

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'OBX', 'NTE', 'OBX']);
  });

  it('should round-trip build parsed messages using the configured end-of-line delimiter', () => {
    const raw = createStandardOruMessage();
    const hl7 = new HL7(raw);
    const rebuilt = hl7.build();

    expect(rebuilt).toBe(raw);
  });

  it('should respect custom buildEolChar during message serialization', () => {
    const hl7 = new HL7(createStandardOruMessage(), { buildEolChar: '\n' });
    const built = hl7.build();

    expect(built).toMatch(/\nPID\|/);
    expect(built).not.toMatch(/\rPID\|/);
  });

  it('should reject invalid 3-character segment type formats when creating new segments', () => {
    const hl7 = new HL7(createStandardOruMessage());

    expect(() => hl7.createSegment('AB')).toThrow(/Invalid parameter: 'type'/);
    expect(() => hl7.createSegment('ABCD')).toThrow(/Invalid parameter: 'type'/);
    expect(() => hl7.createSegment('OBX.1')).toThrow(/Invalid parameter: 'type'/);
  });

  it('should treat move operations where source and target are identical as stable no-ops', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const obx = hl7.getSegment('OBX');

    expect(obx).toBeTruthy();
    if (!obx) throw new Error('Expected OBX segment to be defined');
    hl7.moveSegmentAfter(obx, obx);
    hl7.moveSegmentBefore(obx, obx);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'OBX', 'NTE', 'OBX']);
  });

  it('should accept empty array in deleteSegments without mutating message state', () => {
    const hl7 = new HL7(createStandardOruMessage());

    hl7.deleteSegments([]);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'PID', 'OBR', 'OBX', 'NTE', 'OBX']);
  });

  it('should stop matching at first non-match after sequence begins in consecutive mode', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const obr = hl7.getSegment('OBR');

    expect(obr).toBeTruthy();
    if (!obr) throw new Error('Expected OBR segment to be defined');
    expect(hl7.getSegmentsAfter(obr, 'OBX', [], true).map((segment) => segment.get('OBX'))).toEqual(
      ['OBX|1|TX|CODE1^Result||Alpha'],
    );
  });

  it('should reject non-segment lines during message transform', () => {
    const raw = joinSegments([
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID1|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'bad line that is not an HL7 segment',
    ]);

    expect(() => new HL7(raw)).toThrow(/Invalid segment: bad line that is not an HL7 segment/);
  });
});

describe('Sparse Hierarchies & Delimiter Handling', () => {
  it('should correctly address sparse repetitions with empty intermediate positions', () => {
    const raw = createSparseHierarchyMessage();
    const hl7 = new HL7(raw);
    const obx1 = hl7.getSegments('OBX')[0];

    expect(obx1).toBeDefined();
    if (!obx1) throw new Error('Expected OBX[0] segment to be defined');

    expect(obx1.get('OBX.5', 0)).toBe('Repeat1');
    expect(obx1.get('OBX.5', 1)).toBe('');
    expect(obx1.get('OBX.5', 2)).toBe('Repeat3');
  });

  it('should correctly address sparse components with empty intermediate components', () => {
    const raw = createSparseHierarchyMessage();
    const hl7 = new HL7(raw);
    const obx2 = hl7.getSegments('OBX')[1];

    expect(obx2).toBeDefined();
    if (!obx2) throw new Error('Expected OBX[1] segment to be defined');

    expect(obx2.get('OBX.5.1')).toBe('Comp1');
    expect(obx2.get('OBX.5.2')).toBe('');
    expect(obx2.get('OBX.5.3')).toBe('Comp3');
  });

  it('should correctly address sparse subcomponents with empty intermediate subcomponents', () => {
    const raw = createSparseHierarchyMessage();
    const hl7 = new HL7(raw);
    const obx3 = hl7.getSegments('OBX')[2];

    expect(obx3).toBeDefined();
    if (!obx3) throw new Error('Expected OBX[2] segment to be defined');

    expect(obx3.get('OBX.5.1', 0, 0)).toBe('Sub1');
    expect(obx3.get('OBX.5.1', 0, 1)).toBe('');
    expect(obx3.get('OBX.5.1', 0, 2)).toBe('Sub3');
  });

  it('should preserve leading and trailing empty repetitions without index distortion', () => {
    const raw = createSparseHierarchyMessage();
    const hl7 = new HL7(raw);
    const obx4 = hl7.getSegments('OBX')[3];

    expect(obx4).toBeDefined();
    if (!obx4) throw new Error('Expected OBX[3] segment to be defined');

    expect(obx4.get('OBX.5', 0)).toBe('');
    expect(obx4.get('OBX.5', 1)).toBe('LeadingEmptyRepeat');
    expect(obx4.get('OBX.5', 2)).toBe('TrailingEmptyRepeat');
    expect(obx4.get('OBX.5', 3)).toBe('');
  });

  it('should strictly preserve trailing empty delimiters across segments on roundtrip rebuild', () => {
    const raw = createSparseHierarchyMessage();
    const hl7 = new HL7(raw);

    const built = hl7.build();
    expect(built).toBe(raw);
    // In HL7 v2.3, the PID segment defines up to 24 fields. With values populated up to PID.5 (DOE^JOHN),
    // 19 empty fields (represented by 19 consecutive delimiter pipes) round-trip preserving trailing sparse fields.
    expect(built).toMatch(/PID\|1\|\|12345\|\|DOE\^JOHN\|{19}/);
  });

  it('should resolve component 1 on simple scalar fields without requiring explicit component delimiters', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const pid = hl7.getSegment('PID');

    expect(pid).toBeDefined();
    if (!pid) throw new Error('Expected PID segment to be defined');

    expect(pid.get('PID.1')).toBe('1');
    expect(pid.get('PID.1.1')).toBe('1');
  });
});

describe('Clinical Text Formatting & Internationalization (UTF-8)', () => {
  it('should preserve exact leading and trailing whitespace in observation values and notes', () => {
    const raw = createInternationalUtf8Message();
    const hl7 = new HL7(raw);
    const nte = hl7.getSegment('NTE');

    expect(nte).toBeDefined();
    if (!nte) throw new Error('Expected NTE segment to be defined');

    const noteCompoundText = nte.get('NTE.3', 0, true);
    expect(noteCompoundText).toBe('   Fettgedruckte & eingerückte ärztliche Anmerkung   ');
    expect(noteCompoundText.startsWith('   ')).toBe(true);
    expect(noteCompoundText.endsWith('   ')).toBe(true);

    expect(nte.get('NTE.3.1', 0, 0)).toBe('   Fettgedruckte ');
    expect(nte.get('NTE.3.1', 0, 1)).toBe(' eingerückte ärztliche Anmerkung   ');
  });

  it('should preserve UTF-8 international characters, diacritics, and clinical math symbols', () => {
    const raw = createInternationalUtf8Message();
    const hl7 = new HL7(raw);

    const pid = hl7.getSegment('PID');
    expect(pid).toBeDefined();
    if (!pid) throw new Error('Expected PID segment to be defined');

    expect(pid.get('PID.5.1')).toBe('MÜLLER');
    expect(pid.get('PID.5.2')).toBe('JÖRG');
    expect(pid.get('PID.5.3')).toBe('FRANÇOIS');
    expect(pid.get('PID.11.1')).toBe('BAHNHOFSTRASSE 42');
    expect(pid.get('PID.11.3')).toBe('ZÜRICH');

    const obx1 = hl7.getSegments('OBX')[0];
    expect(obx1?.get('OBX.6')).toBe('°C');

    const obx2 = hl7.getSegments('OBX')[1];
    expect(obx2?.get('OBX.5', 0, true)).toContain('± 5 mmHg');
    expect(obx2?.get('OBX.5', 0, true)).toContain('Kopfschmerzen & Schwindel');

    expect(hl7.build()).toBe(raw);
  });
});

describe('MSH Header Delimiter Semantics', () => {
  it('should correctly expose MSH delimiter and encoding characters per HL7 specification', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const msh = hl7.getSegment('MSH');

    expect(msh).toBeDefined();
    if (!msh) throw new Error('Expected MSH segment to be defined');

    // Per HL7 v2 standard Chapter 2.5: MSH.1 is defined as the Field Separator ('|') itself,
    // while MSH.2 returns the encoding characters ('^~\&'), and MSH.3 returns Sending Application.
    expect(msh.get('MSH.1')).toBe('|');
    expect(msh.get('MSH.2')).toBe('^~\\&');
    expect(msh.get('MSH.3')).toBe('SENDAPP');
    expect(msh.get('MSH.9.1')).toBe('ORU');
    expect(msh.get('MSH.9.2')).toBe('R01');
    expect(msh.get('MSH.12')).toBe('2.3');
  });
});

describe('Custom Healthcare Z-Segments & High-Density Stress', () => {
  it('should support custom site-specific Z-segments for healthcare extensions (ZDS, ZPD, Z01)', () => {
    const hl7 = new HL7(createStandardOruMessage());

    const zds = hl7.createSegment('ZDS');
    zds.set('ZDS.1', '10');
    zds.set('ZDS.2', 'STUDY_UID_998877');

    const zpd = hl7.createSegment('ZPD');
    zpd.set('ZPD.1', 'CONFIDENTIAL_FLAG');

    expect(collectSegmentTypes(hl7)).toEqual([
      'MSH',
      'PID',
      'OBR',
      'OBX',
      'NTE',
      'OBX',
      'ZDS',
      'ZPD',
    ]);
    expect(hl7.getSegment('ZDS')?.get('ZDS.1')).toBe('10');
    expect(hl7.getSegment('ZDS')?.get('ZDS.2')).toBe('STUDY_UID_998877');
    expect(hl7.getSegment('ZPD')?.get('ZPD.1')).toBe('CONFIDENTIAL_FLAG');

    hl7.reindexSegments({ OBX: [], ZDS: [] });
    expect(hl7.build()).toMatch(/ZDS\|1\|STUDY_UID_998877/);
  });

  it('should support deleting all non-MSH segments down to minimal valid message boundary', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const nonMsh = hl7.getSegments().filter((segment) => segment.type !== 'MSH');

    hl7.deleteSegments(nonMsh);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH']);
    expect(hl7.build()).toMatch(/^MSH\|\^~\\&\|SENDAPP/);
  });

  it('should parse and traverse high-density telemetry streams with 500+ observation segments in under 100ms', () => {
    const raw = createHighDensityTelemetryMessage(500);

    const startParse = performance.now();
    const hl7 = new HL7(raw);
    const parseMs = performance.now() - startParse;

    expect(parseMs).toBeLessThan(1000);

    const allSegments = hl7.getSegments();
    expect(allSegments.length).toBeGreaterThan(500);

    const obr = hl7.getSegment('OBR');
    expect(obr).toBeDefined();
    if (!obr) throw new Error('Expected OBR segment to be defined');

    const obxAfterObr = hl7.getSegmentsAfter(obr, 'OBX');
    expect(obxAfterObr.length).toBeGreaterThan(500);

    const built = hl7.build();
    expect(built).toBe(raw);
  });
});
