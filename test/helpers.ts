import type { HL7 } from '../src/index.ts';
import type { SegmentType } from '../src/utils/types.ts';

// Re-export all message fixtures and factories
export * from './fixtures/messages.ts';

/**
 * Extracts the array of 3-character segment types in their message occurrence order.
 */
export function collectSegmentTypes(hl7: HL7): SegmentType[] {
  return hl7.getSegments().map((segment) => segment.type);
}

/**
 * Serializes the message and returns the final segment line.
 */
export function getLastSerializedSegmentLine(hl7: HL7): string | undefined {
  return hl7.build().split(hl7.parseOptions.buildEolChar).at(-1);
}
