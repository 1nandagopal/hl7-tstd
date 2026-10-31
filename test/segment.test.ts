import { describe, expect, it } from 'vite-plus/test';
import { HL7 } from '../src/index.ts';
import {
  createComplexHierarchyMessage,
  createStandardOruMessage,
  getLastSerializedSegmentLine,
} from './helpers.ts';

describe('Segment Field Retrieval Operations', () => {
  it('should return complete serialized segment when addressed by type with true repeat & subcomponent flags', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const segment = hl7.getSegment('ZYX');

    expect(segment).toBeDefined();
    if (!segment) throw new Error('Expected ZYX segment to be defined');

    expect(segment.get('ZYX', true, true)).toBe(
      'ZYX|1|A|B|C|Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3',
    );
  });

  it('should accurately resolve dotted paths for field, component, repetition, and subcomponent levels', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const segment = hl7.getSegment('ZYX');

    expect(segment).toBeDefined();
    if (!segment) throw new Error('Expected ZYX segment to be defined');

    expect(segment.get('ZYX.5')).toBe('Repeat1');
    expect(segment.get('ZYX.5', true)).toBe(
      'Repeat1~Component1^Component2~SubComp1^Component2~Repeat3',
    );
    expect(segment.get('ZYX.5.1', 1)).toBe('Component1');
    expect(segment.get('ZYX.5.2', 1)).toBe('Component2');
    expect(segment.get('ZYX.5.1', 2)).toBe('SubComp1');
    expect(segment.get('ZYX.5.1', 2, 1)).toBe('SubComp2');
    expect(segment.get('ZYX.5.1', 2, true)).toBe('SubComp1&SubComp2');
  });

  it('should throw validation errors when attempting to access invalid paths or negative indexes', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const segment = hl7.getSegment('ZYX');

    expect(segment).toBeDefined();
    if (!segment) throw new Error('Expected ZYX segment to be defined');

    expect(() => segment.get('')).toThrow(/Invalid parameter: 'field'/);
    expect(() => segment.get('PID')).toThrow(/Cannot get/);
    expect(() => segment.get('ZYX', -1)).toThrow(/Invalid parameter: 'repeatingIndex'/);
    expect(() => segment.get('ZYX', 0, -1)).toThrow(/Invalid parameter: 'subComponentIndex'/);
    // Cast invalid boolean to test runtime type validation guard when called from untyped JavaScript
    expect(() => segment.get('ZYX', false as unknown as number)).toThrow(
      /Invalid parameter: 'repeatingIndex'/,
    );
  });
});

describe('Segment Mutation & Tree Expansion', () => {
  it('should set simple field values on newly created segments', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.1', 'VALUE');

    expect(segment.get('ABC.1')).toBe('VALUE');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC|VALUE');
    expect(hl7.getSegment('ABC')).toBe(segment);
  });

  it('should automatically expand missing repetitions and subcomponents when writing deep paths', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.5.1', 'COMP1', 1, 0);
    segment.set('ABC.5.2', 'COMP2', 1, 0);
    segment.set('ABC.5.1', 'SUB1', 2, 0);
    segment.set('ABC.5.1', 'SUB2', 2, 1);

    expect(segment.get('ABC.5.1', 1, 0)).toBe('COMP1');
    expect(segment.get('ABC.5.2', 1, 0)).toBe('COMP2');
    expect(segment.get('ABC.5.1', 2, 0)).toBe('SUB1');
    expect(segment.get('ABC.5.1', 2, 1)).toBe('SUB2');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC|||||~COMP1^COMP2~SUB1&SUB2');
  });

  it('should support bulk replacement using true index parameters', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    segment.set('ABC.2.1', 'WHOLE', true, true);

    expect(segment.get('ABC.2')).toBe('WHOLE');
    expect(getLastSerializedSegmentLine(hl7)).toBe('ABC||WHOLE');
  });

  it('should allow mutating parsed segments and reflect edits in build() serialization', () => {
    const hl7 = new HL7(createComplexHierarchyMessage());
    const pid = hl7.getSegment('PID');

    expect(pid).toBeDefined();
    if (!pid) throw new Error('Expected PID segment to be defined');

    pid.set('PID.5.1', 'SMITH');
    pid.set('PID.5.2', 'JANE');

    const built = hl7.build();
    expect(built).toMatch(/PID\|1\|\|12345\^\^\^MRN\|\|SMITH\^JANE\^A/);
  });

  it('should throw validation errors on invalid mutation parameters', () => {
    const hl7 = new HL7(createStandardOruMessage());
    const segment = hl7.createSegment('ABC');

    expect(() => segment.set('', 'VALUE')).toThrow(/Invalid parameter: 'field'/);
    expect(() => segment.set('PID.1', 'VALUE')).toThrow(/Cannot set/);
    expect(() => segment.set('ABC.1', null as unknown as string)).toThrow(
      /Invalid parameter: 'value'/,
    );
    expect(() => segment.set('ABC.1', 'VALUE', -1)).toThrow(/Invalid parameter: 'repeatingIndex'/);
    expect(() => segment.set('ABC.1', 'VALUE', 0, -1)).toThrow(
      /Invalid parameter: 'subComponentIndex'/,
    );
    // Cast invalid boolean to test runtime type validation guard when called from untyped JavaScript
    expect(() => segment.set('ABC.1', 'VALUE', false as unknown as number)).toThrow(
      /Invalid parameter: 'repeatingIndex'/,
    );
  });
});
