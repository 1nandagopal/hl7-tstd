import { describe, expect, it } from 'vite-plus/test';
import { HL7 } from '../src/index.ts';
import {
  collectSegmentTypes,
  createEmbeddedPdfReportMessage,
  createMockPdfBase64,
  createMultiAttachmentReportMessage,
} from './helpers.ts';

describe('Embedded Documents & Large Payload Processing', () => {
  it('should parse an HL7 message with a 150KB+ Base64 PDF in an OBX segment and preserve segment order', () => {
    const { raw, pdfBase64 } = createEmbeddedPdfReportMessage({ pdfSizeBytes: 150 * 1024 });

    const hl7 = new HL7(raw);

    expect(collectSegmentTypes(hl7)).toEqual(['MSH', 'EVN', 'PID', 'PV1', 'TXA', 'OBX']);
    const obx = hl7.getSegment('OBX');
    expect(obx).toBeDefined();
    if (!obx) throw new Error('Expected OBX segment to be defined');

    expect(obx.get('OBX.2')).toBe('ED');
    expect(obx.get('OBX.3.1')).toBe('PDF_REPORT');
    expect(obx.get('OBX.5.2')).toBe('APPLICATION');
    expect(obx.get('OBX.5.3')).toBe('PDF');
    expect(obx.get('OBX.5.4')).toBe('Base64');

    const extractedPdf = obx.get('OBX.5.5');
    expect(extractedPdf).toBe(pdfBase64);
    expect(extractedPdf.length).toBeGreaterThan(150 * 1024);
  });

  it('should parse and process multi-megabyte (2.5MB+ binary / 3.3MB+ Base64) PDF payloads under 100ms', () => {
    const { raw, pdfBase64, pdfBuffer } = createEmbeddedPdfReportMessage({
      pdfSizeBytes: 2.5 * 1024 * 1024,
      reportTitle: 'High-Resolution 3D MRI Volume Scan',
    });

    const startParse = performance.now();
    const hl7 = new HL7(raw);
    const parseDuration = performance.now() - startParse;

    expect(parseDuration).toBeLessThan(1000);

    const obx = hl7.getSegment('OBX');
    expect(obx).toBeDefined();
    if (!obx) throw new Error('Expected OBX segment to be defined');

    const extractedBase64 = obx.get('OBX.5.5');
    expect(extractedBase64).toBe(pdfBase64);
    expect(extractedBase64.length).toBeGreaterThan(3 * 1024 * 1024);

    const decodedBuffer = Buffer.from(extractedBase64, 'base64');
    expect(decodedBuffer.equals(pdfBuffer)).toBe(true);
    expect(decodedBuffer.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(decodedBuffer.subarray(decodedBuffer.length - 5).toString('utf8')).toBe('%%EOF');

    const startBuild = performance.now();
    const rebuilt = hl7.build();
    const buildDuration = performance.now() - startBuild;

    expect(buildDuration).toBeLessThan(1000);
    expect(rebuilt).toBe(raw);
  });

  it('should validate full binary integrity of extracted PDF payload (PDF magic bytes and EOF marker)', () => {
    const { raw, pdfBuffer } = createEmbeddedPdfReportMessage({ pdfSizeBytes: 80 * 1024 });
    const hl7 = new HL7(raw);
    const obx = hl7.getSegment('OBX');

    expect(obx).toBeDefined();
    if (!obx) throw new Error('Expected OBX segment to be defined');

    const base64Data = obx.get('OBX.5.5');
    const decodedBuffer = Buffer.from(base64Data, 'base64');

    expect(decodedBuffer.equals(pdfBuffer)).toBe(true);
    expect(decodedBuffer.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');
    expect(decodedBuffer.subarray(decodedBuffer.length - 5).toString('utf8')).toBe('%%EOF');
  });

  it('should round-trip large embedded-document messages through build() without data corruption', () => {
    const { raw } = createEmbeddedPdfReportMessage({ pdfSizeBytes: 200 * 1024 });
    const hl7 = new HL7(raw);

    const serialized = hl7.build();

    expect(serialized).toBe(raw);
    expect(serialized.length).toBe(raw.length);
  });

  it('should allow mutating metadata segments while preserving large PDF payloads untouched', () => {
    const { raw, pdfBase64 } = createEmbeddedPdfReportMessage({ pdfSizeBytes: 100 * 1024 });
    const hl7 = new HL7(raw);

    const pid = hl7.getSegment('PID');
    expect(pid).toBeDefined();
    if (!pid) throw new Error('Expected PID segment to be defined');

    pid.set('PID.5.1', 'NEW_LAST_NAME');
    pid.set('PID.5.2', 'NEW_FIRST_NAME');

    const obx = hl7.getSegment('OBX');
    expect(obx).toBeDefined();
    if (!obx) throw new Error('Expected OBX segment to be defined');

    const nte = hl7.createSegmentAfter('NTE', obx);
    nte.set('NTE.3', 'Verified by Radiologist on Call');

    const built = hl7.build();

    expect(built).toMatch(/PID\|1\|\|12345\^\^\^MRN\|\|NEW_LAST_NAME\^NEW_FIRST_NAME/);
    expect(built).toMatch(/NTE\|\|\|Verified by Radiologist on Call/);

    const reloaded = new HL7(built);
    const reloadedObx = reloaded.getSegment('OBX');
    expect(reloadedObx?.get('OBX.5.5')).toBe(pdfBase64);
  });

  it('should support replacing an existing embedded PDF with a revised report', () => {
    const { raw } = createEmbeddedPdfReportMessage({ pdfSizeBytes: 50 * 1024 });
    const hl7 = new HL7(raw);
    const obx = hl7.getSegment('OBX');
    expect(obx).toBeDefined();
    if (!obx) throw new Error('Expected OBX segment to be defined');

    const revisedPdfBase64 = createMockPdfBase64(120 * 1024);
    obx.set('OBX.5.5', revisedPdfBase64);

    expect(obx.get('OBX.5.5')).toBe(revisedPdfBase64);
    const rebuilt = hl7.build();
    expect(rebuilt).toContain(revisedPdfBase64);

    const reloaded = new HL7(rebuilt);
    expect(reloaded.getSegment('OBX')?.get('OBX.5.5')).toBe(revisedPdfBase64);
  });

  it('should handle multi-attachment messages containing multiple distinct large embedded documents', () => {
    const { raw, attachments } = createMultiAttachmentReportMessage([200 * 1024, 300 * 1024]);
    const hl7 = new HL7(raw);

    const obxSegments = hl7.getSegments('OBX');
    expect(obxSegments).toHaveLength(2);

    expect(obxSegments[0]?.get('OBX.5.5')).toBe(attachments[0]?.base64);
    expect(obxSegments[1]?.get('OBX.5.5')).toBe(attachments[1]?.base64);

    const dec0 = Buffer.from(obxSegments[0]?.get('OBX.5.5') ?? '', 'base64');
    const dec1 = Buffer.from(obxSegments[1]?.get('OBX.5.5') ?? '', 'base64');

    expect(dec0.equals(attachments[0]!.buffer)).toBe(true);
    expect(dec1.equals(attachments[1]!.buffer)).toBe(true);

    expect(hl7.build()).toBe(raw);
  });

  it('should ensure lightweight header queries remain sub-millisecond on multi-megabyte messages', () => {
    const { raw } = createEmbeddedPdfReportMessage({ pdfSizeBytes: 2 * 1024 * 1024 });
    const hl7 = new HL7(raw);

    const startLookup = performance.now();
    const pid = hl7.getSegment('PID');
    const patientMrn = pid?.get('PID.3.1');
    const lookupDuration = performance.now() - startLookup;

    expect(patientMrn).toBe('12345');
    expect(lookupDuration).toBeLessThan(100);
  });
});
