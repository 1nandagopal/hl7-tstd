/**
 * Test message fixtures and generators for HL7 v2 clinical messages.
 */

export function joinSegments(segments: string[], eol = '\r'): string {
  return segments.join(eol);
}

/**
 * Standard ORU^R01 observation message with interleaved notes:
 * Structure: MSH -> PID -> OBR -> OBX|1 -> NTE|1 -> OBX|2.
 * Used for testing non-contiguous segment sequences where notes interrupt observation groups.
 */
export function createStandardOruMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID1|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'OBR|1||ORDER1|TEST^Panel',
      'OBX|1|TX|CODE1^Result||Alpha',
      'NTE|1|L|Observation note',
      'OBX|2|TX|CODE2^Result||Beta',
    ],
    eol,
  );
}

/**
 * Full clinical diagnostic report message with contiguous observation blocks:
 * Structure: MSH -> PID -> OBR -> OBX|1 -> OBX|2 -> NTE|1 -> DG1|1.
 * Used for testing contiguous observation sequences followed by diagnosis codes.
 */
export function createDiagnosticReportMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID1|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'OBR|1||ORDER1|TEST^Panel',
      'OBX|1|TX|CODE1^Result||Alpha',
      'OBX|2|TX|CODE2^Result||Beta',
      'NTE|1|L|Observation note',
      'DG1|1||A00^Diagnosis',
    ],
    eol,
  );
}

/**
 * Inpatient admission ADT^A01 message with MSH, PID, and PV1 patient visit information.
 */
export function createInpatientAdtMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|ADTAPP|ADTFAC|RECVAPP|RECVFAC|202401011245||ADT^A01|MSGID2|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'PV1|1|I|WARD^101^1',
    ],
    eol,
  );
}

/**
 * Message demonstrating custom field delimiter (`*` instead of standard `|`).
 */
export function createAsteriskDelimitedMessage(eol = '\n'): string {
  return joinSegments(
    [
      'MSH*^~\\&*SEND*FAC*RECV*RFAC*202401011300**ORU^R01*MSGID3*P*2.3',
      'PID*1**12345^^^MRN**DOE^JANE',
    ],
    eol,
  );
}

/**
 * Message demonstrating non-standard encoding characters (`@$%?` instead of `^~\&`).
 */
export function createCustomEncodingCharactersMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH*@$%?*SEND*FAC*RECV*RFAC*202401011300**ORU@R01*MSGID3*P*2.3',
      'PID*1**12345@@@MRN**DOE@JANE',
      'OBX*1*TX*CODE1@Result**Alpha$Beta',
    ],
    eol,
  );
}

/**
 * Complex segment hierarchy with repeated fields, component groups, and subcomponents.
 */
export function createComplexHierarchyMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|SEND|SFAC|RECV|RFAC|202401011230||ORU^R01|MSGID1|P|2.3',
      'ZYX|1|A|B|C|Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3',
      'PID|1||12345^^^MRN||DOE^JOHN^A',
    ],
    eol,
  );
}

/**
 * Observation message with grouped observation order panels and intervening NTE notes.
 */
export function createGroupedObservationsMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID9|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'OBR|1||ORDER1|TEST^Panel',
      'NTE|9|L|Panel note 1',
      'OBR|2||ORDER2|TEST^Panel',
      'NTE|9|L|Panel note 2',
    ],
    eol,
  );
}

/**
 * Message containing sparse hierarchies:
 * - Empty repeats (`Repeat1~~Repeat3`)
 * - Empty components (`Comp1^^Comp3`)
 * - Empty subcomponents (`Sub1&&Sub3`)
 * - Trailing and leading repeat delimiters
 * - Multiple trailing pipes
 */
export function createSparseHierarchyMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|SENDAPP|SENDFAC|RECVAPP|RECVFAC|202401011230||ORU^R01|MSGID_SPARSE|P|2.3',
      'PID|1||12345||DOE^JOHN|||||||||||||||||||',
      'OBX|1|TX|CODE1||Repeat1~~Repeat3||||||F',
      'OBX|2|TX|CODE2||Comp1^^Comp3||||||F',
      'OBX|3|TX|CODE3||Sub1&&Sub3||||||F',
      'OBX|4|TX|CODE4||~LeadingEmptyRepeat~TrailingEmptyRepeat~||||||F',
    ],
    eol,
  );
}

/**
 * Internationalized HL7 message containing non-ASCII names, diacritics, and medical units.
 */
export function createInternationalUtf8Message(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|GLOBAL_LAB|ZÜRICH_HOSP|EMR_APP|BERN_CLINIC|202401011230||ORU^R01|MSG_INTL_1|P|2.3',
      'PID|1||98765^^^AHV||MÜLLER^JÖRG^FRANÇOIS||19780312|M|||BAHNHOFSTRASSE 42^^ZÜRICH^^8001^CHE',
      'PV1|1|I|INTENSIVSTATION^BETT_4',
      'OBX|1|NM|TEMP^Körpertemperatur||38.5|°C|36.5 - 37.5|H|||F',
      'OBX|2|TX|DIAG^Klinischer Befund||Blutdruck ± 5 mmHg; Patient klagt über Kopfschmerzen & Schwindel||||||F',
      'NTE|1|L|   Fettgedruckte & eingerückte ärztliche Anmerkung   ',
    ],
    eol,
  );
}

/**
 * Microbiology isolate & antibiogram susceptibility hierarchy (ORU^R01).
 * Features parent blood culture order and child susceptibility panel.
 */
export function createMicrobiologyReportMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|MICRO_LAB|CENTRAL_HOSP|EMR_APP|INFECTIOUS_DIS|20240101120000||ORU^R01|MSG_MICRO_01|P|2.3',
      'PID|1||12345^^^MRN||SMITH^ROBERT^W||19700415|M',
      'PV1|1|I|MED_SURG^ROOM_302',
      'OBR|1||CULT_9901|BLOOD_CULTURE^Blood Culture, Aerobic & Anaerobic|||||||||||SPEC_8801',
      'OBX|1|ST|ISOLATE_1^Organism Isolated||Staphylococcus aureus||||||F',
      'OBX|2|ST|COLONY_COUNT^Colony Count||>100,000 CFU/mL||||||F',
      'OBR|2||SUSC_9902|ANTIBIOGRAM^Antimicrobial Susceptibility Panel|||||||||||CULT_9901',
      'OBX|1|ST|VANCOMYCIN^Vancomycin||<= 1.0|ug/mL|<= 2.0|S|||F',
      'OBX|2|ST|OXACILLIN^Oxacillin||>= 4.0|ug/mL|<= 2.0|R|||F',
      'OBX|3|ST|GENTAMICIN^Gentamicin||<= 2.0|ug/mL|<= 4.0|S|||F',
      'OBX|4|ST|LINEZOLID^Linezolid||<= 2.0|ug/mL|<= 4.0|S|||F',
    ],
    eol,
  );
}

/**
 * Complex patient registration ADT^A08 with primary/secondary insurance (IN1), guarantor (GT1), diagnoses (DG1), and procedures (PR1).
 */
export function createBillingPatientRegistrationMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|REG_SYSTEM|HOSP_MAIN|BILLING_APP|REV_CYCLE|20240101140000||ADT^A08|MSG_BILLING_101|P|2.3',
      'PID|1||998877^^^MRN~112233^^^SSN||JOHNSON^PATRICIA^A||19651120|F|||100 MAIN ST^^BOSTON^MA^02115',
      'NK1|1|JOHNSON^MARK|HUSBAND|100 MAIN ST^^BOSTON^MA^02115|(617)555-1234',
      'PV1|1|I|CARDIOLOGY^ROOM_510',
      'IN1|1|INS_BCBS|BLUE CROSS BLUE SHIELD|PO BOX 1000^^BOSTON^MA^02115|||GRP_998811|CORP_EMPLOYER',
      'IN1|2|INS_MEDICARE|MEDICARE PART B|PO BOX 2000^^BALTIMORE^MD^21201',
      'GT1|1|JOHNSON^PATRICIA^A|SELF|100 MAIN ST^^BOSTON^MA^02115',
      'DG1|1||I25.10^Atherosclerotic heart disease of native coronary artery',
      'DG1|2||E11.9^Type 2 diabetes mellitus without complications',
      'PR1|1||99214^Office or other outpatient visit, 30-39 minutes',
    ],
    eol,
  );
}

/**
 * CDC Public Health Vaccine Administration record (VXU^V04) with pediatric immunization data.
 */
export function createImmunizationRegistryMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|PEDIATRIC_EHR|CLINIC_NORTH|STATE_REGISTRY|STATE_DOH|20240101100000||VXU^V04|MSG_VXU_5501|P|2.3.1',
      'PID|1||554433^^^MRN||BABY^EMMA||20230601|F',
      'NK1|1|BABY^SARAH|MTH^Mother',
      'RXA|0|1|20240101100000|20240101100000|08^Hep B, pediatric or adolescent^CVX|0.5|mL||00^Administered||||LOT_9922AA|20251231|MSD^Merck',
      'RXR|C28161^Intramuscular^NCIT|LD^Left Deltoid^HL70163',
      'OBX|1|CE|64994-8^Vaccine funding program eligibility^LN||V02^VFC eligible - Medicaid/Medicaid Managed Care^HL70064||||||F',
    ],
    eol,
  );
}

/**
 * Inpatient medication order (RDE^O11 / ORM^O01) with complex repeating dosing schedules in ORC-7 and RXE.
 */
export function createPharmacyOrderMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|CPOE_APP|SURG_HOSP|PHARMACY_SYS|CENTRAL_PHARM|20240101080000||RDE^O11|MSG_PHARM_881|P|2.3',
      'PID|1||776655^^^MRN||WILLIAMS^DAVID||19550210|M',
      'PV1|1|I|SURG_ICU^BED_02',
      'ORC|NW|ORD_RX_1001|||||1^BID^202401010800^^^Q12H~1^BID^202401012000^^^Q12H|||||12345^DR_HOUSE',
      'RXE|1^Q12H|AMOX_500^Amoxicillin 500mg Oral Capsule|500|mg||PO|||||12^Hours',
      'RXR|PO^Oral^HL70162',
    ],
    eol,
  );
}

/**
 * Wraps an HL7 message in standard TCP/IP MLLP (Minimal Lower Layer Protocol) framing:
 * <VT> (0x0b) + HL7 message + <FS><CR> (0x1c 0x0d)
 */
export function wrapInMllpFrame(hl7Message: string): string {
  return `\x0b${hl7Message}\x1c\x0d`;
}

/**
 * Strips standard TCP/IP MLLP (Minimal Lower Layer Protocol) envelope characters from raw socket buffer string.
 */
export function stripMllpFrame(socketData: string): string {
  let data = socketData;
  if (data.charCodeAt(0) === 0x0b) {
    data = data.slice(1);
  }
  if (data.charCodeAt(data.length - 1) === 0x0d && data.charCodeAt(data.length - 2) === 0x1c) {
    data = data.slice(0, -2);
  } else if (data.charCodeAt(data.length - 1) === 0x1c) {
    data = data.slice(0, -1);
  }
  return data;
}

/**
 * Generates a structurally plausible, not XRef-valid, test-only PDF binary buffer of the requested target size.
 */
export function createMockPdfBuffer(targetSizeBytes = 50 * 1024): Buffer {
  const header =
    '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
    '4 0 obj\n<< /Length ';
  const footer = ' >>\nstream\n';
  const end =
    '\nendstream\nendobj\n' +
    'xref\n0 5\n' +
    '0000000000 65535 f \n' +
    '0000000009 00000 n \n' +
    '0000000058 00000 n \n' +
    '0000000115 00000 n \n' +
    '0000000216 00000 n \n' +
    'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n300\n%%EOF';

  const overhead = header.length + footer.length + end.length + 10;
  const paddingNeeded = Math.max(0, targetSizeBytes - overhead);
  const streamData =
    'BT /F1 12 Tf 72 712 Td (Diagnostic Report Content) Tj ET\n' + 'A'.repeat(paddingNeeded);
  const content = header + streamData.length.toString() + footer + streamData + end;

  return Buffer.from(content, 'utf8');
}

/**
 * Generates a Base64-encoded string representing a valid PDF.
 */
export function createMockPdfBase64(targetSizeBytes = 50 * 1024): string {
  return createMockPdfBuffer(targetSizeBytes).toString('base64');
}

export interface EmbeddedPdfReportOptions {
  pdfSizeBytes?: number;
  eol?: string;
  reportTitle?: string;
  patientId?: string;
  patientName?: string;
}

/**
 * Generates a full HL7 v2 MDM^T02 / ORU^R01 message with an embedded Base64 PDF in an OBX segment.
 * Follows standard HL7 Encapsulated Data (ED) structure:
 * OBX-5: ^APPLICATION^PDF^Base64^<data>
 */
export function createEmbeddedPdfReportMessage(options: EmbeddedPdfReportOptions = {}): {
  raw: string;
  pdfBase64: string;
  pdfBuffer: Buffer;
} {
  const eol = options.eol ?? '\r';
  const pdfSizeBytes = options.pdfSizeBytes ?? 100 * 1024;
  const pdfBuffer = createMockPdfBuffer(pdfSizeBytes);
  const pdfBase64 = pdfBuffer.toString('base64');
  const reportTitle = options.reportTitle ?? 'Radiology Diagnostic Report';
  const patientId = options.patientId ?? '12345^^^MRN';
  const patientName = options.patientName ?? 'DOE^JANE^M';

  const raw = joinSegments(
    [
      'MSH|^~\\&|RADIOLOGY_PACS|HOSPITAL_A|EMR_SYSTEM|CLINIC_B|20240101123000||MDM^T02|MSG_PDF_1001|P|2.3',
      'EVN|T02|20240101123000',
      `PID|1||${patientId}||${patientName}||19850615|F`,
      'PV1|1|O|RAD^EXAM_101',
      'TXA|1|CN|TX|20240101123000||||||||DOCID_998877|||||||AV',
      `OBX|1|ED|PDF_REPORT^${reportTitle}||^APPLICATION^PDF^Base64^${pdfBase64}||||||F`,
    ],
    eol,
  );

  return { raw, pdfBase64, pdfBuffer };
}

/**
 * Generates an HL7 message with multiple distinct large embedded documents (e.g., MRI scan + Lab report).
 */
export function createMultiAttachmentReportMessage(
  sizes: number[] = [150 * 1024, 250 * 1024],
  eol = '\r',
): { raw: string; attachments: { title: string; base64: string; buffer: Buffer }[] } {
  const attachments = sizes.map((size, idx) => {
    const buffer = createMockPdfBuffer(size);
    return {
      title: `Diagnostic Document Part ${idx + 1}`,
      base64: buffer.toString('base64'),
      buffer,
    };
  });

  const lines = [
    'MSH|^~\\&|PACS|HOSP|EMR|CLINIC|202401011200||MDM^T02|MSG_MULTI_ATTACH|P|2.3',
    'PID|1||88888^^^MRN||DOE^ALEX',
    'TXA|1|CN|TX|20240101120000||||||||DOCID_MULTI|||||||AV',
  ];

  attachments.forEach((att, idx) => {
    lines.push(
      `OBX|${idx + 1}|ED|DOC_${idx + 1}^${att.title}||^APPLICATION^PDF^Base64^${att.base64}||||||F`,
    );
  });

  return { raw: joinSegments(lines, eol), attachments };
}

/**
 * Generates a high-density message containing hundreds of telemetry vital observations.
 */
export function createHighDensityTelemetryMessage(segmentCount = 500, eol = '\r'): string {
  const lines = [
    'MSH|^~\\&|ICU_MONITOR|HOSP_ICU|EMR_SYSTEM|ICU_CENTRAL|20240101120000||ORU^R01|MSG_TELEMETRY_1|P|2.3',
    'PID|1||99999^^^MRN||CRITICAL^PATIENT^A||19600101|M',
    'PV1|1|I|ICU^BED_12',
    'OBR|1||VITAL_STREAM_01|MONITORING^Continuous Telemetry',
  ];

  let obxSeq = 1;
  for (let i = 1; i <= segmentCount; i++) {
    const hr = 60 + (i % 40);
    const spo2 = 95 + (i % 5);
    lines.push(`OBX|${obxSeq++}|NM|HR^Heart Rate||${hr}|bpm|60-100|N|||F`);
    if (i % 2 === 0) {
      lines.push(`OBX|${obxSeq++}|NM|SPO2^Oxygen Saturation||${spo2}|%|95-100|N|||F`);
    }
  }

  return joinSegments(lines, eol);
}

/**
 * Inpatient bed transfer message (ADT^A02) tracking patient movement between hospital wards.
 * PV1-3 contains Assigned Patient Location (PointOfCare^Room^Bed^Facility^^^Building^Floor).
 * PV1-6 contains Prior Patient Location.
 */
export function createBedTransferAdtMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|ADT_SYSTEM|HOSPITAL_MAIN|BED_MGMT|CENTRAL|20240101140000||ADT^A02|MSG_TRANS_001|P|2.3',
      'EVN|A02|20240101140000',
      'PID|1||1002345^^^HOSP^MR||SMITH^ROBERT^J||19750312|M',
      'PV1|1|I|ICU^BED02^01^MAIN_HOSP^^^BUILDING_A^2|3||ED^ROOM01^01^MAIN_HOSP^^^BUILDING_A^1|1024^ATTENDING^ALICE^^^DR||||||||||ADM_9921|1',
    ],
    eol,
  );
}

/**
 * Patient record merge message (ADT^A40) where duplicate records are merged.
 * PID contains surviving master patient record identifiers.
 * MRG contains obsolete/merged patient identifiers in MRG-1.
 */
export function createPatientMergeAdtMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|MPI_SYSTEM|HOSPITAL_MAIN|EHR_CORE|CENTRAL|20240101150000||ADT^A40|MSG_MRG_001|P|2.3.1',
      'EVN|A40|20240101150000',
      'PID|1||SURVIVOR_9901^^^HOSP_MPI^MR~111222333^^^SSN^SS||WILLIAMS^EMILY^A||19881123|F',
      'MRG|DUPLICATE_4402^^^HOSP_MPI^MR||||||WILLIAMS^EMILY',
    ],
    eol,
  );
}

/**
 * Clinical allergy alert message carrying multiple AL1 segments with varying severities and reaction types.
 * AL1-2: Allergy Type (DA=Drug, FA=Food, EA=Environmental).
 * AL1-3: Allergy Code / Description.
 * AL1-4: Allergy Severity (SV=Severe, MO=Moderate, MI=Mild).
 * AL1-5: Allergy Reaction (repeating symptoms separated by ~).
 */
export function createAllergyAdtMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|EMR_CLINICAL|HOSPITAL|PHARMACY|DISPENSARY|20240101160000||ADT^A08|MSG_ALG_001|P|2.3',
      'EVN|A08|20240101160000',
      'PID|1||554433^^^HOSP^MR||JOHNSON^SARAH^L||19920418|F',
      'AL1|1|DA|ALG010^Penicillin^L|SV|ANAPHYLAXIS~HIVES|20240101',
      'AL1|2|FA|ALG020^Peanuts^L|SV|RESPIRATORY DISTRESS|20230512',
      'AL1|3|EA|ALG030^Latex^L|MO|CONTACT DERMATITIS~RASH|20220819',
    ],
    eol,
  );
}

/**
 * Radiology Modality Worklist / PACS order (ORM^O01).
 * ORC carries Placer/Filler order numbers and status (NW=New, IP=In Progress, CM=Completed).
 * OBR carries Diagnostic Section (CT, MR, RAD), procedure codes, and Accession Number.
 * ZDS carries DICOM Study Instance UID.
 */
export function createRadiologyOrderMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|RIS_APP|RADIOLOGY_DEPT|PACS_ARCHIVE|IMAGING|20240101170000||ORM^O01|MSG_RAD_001|P|2.3',
      'PID|1||MRN_778899^^^HOSP^MR||BROWN^MICHAEL^T||19651004|M',
      'PV1|1|O|RAD^EXAM_ROOM_3',
      'ORC|NW|ORD_PL_8801|ACC_990011|GROUP_101|SC||1^ONCE^202401011800||20240101170000|ORD_DOC_123',
      'OBR|1|ORD_PL_8801|ACC_990011|71250^CT CHEST WITH CONTRAST^CPT4|||20240101180000|||||||||REF_DOC_456||ACC_990011||||||CT|F',
      'ZDS|1.2.840.113619.2.55.3.6046883.890.1704117600.123^DICOM_STUDY_UID',
    ],
    eol,
  );
}

/**
 * Outpatient clinic appointment booking message (SIU^S12).
 * SCH contains appointment activity ID, duration, start/end datetimes.
 * AIS contains service/exam code.
 * AIG contains resource/equipment.
 * AIL contains clinic room location.
 * AIP contains practitioner/consultant.
 */
export function createAppointmentSchedulingMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|SCHED_PRO|CLINIC_NORTH|EHR_CORE|CENTRAL|20240101180000||SIU^S12|MSG_SIU_001|P|2.3',
      'SCH|APT_9001|APT_9001||||ROUTINE_CHECKUP|CHECKUP|NORMAL|30|m^Minutes|^^^20240115090000^20240115093000||||||||||||||CONFIRMED',
      'PID|1||MRN_334411^^^CLINIC^MR||DAVIS^EMILY^R||19800722|F',
      'PV1|1|O|CARD_CLINIC^EXAM_2',
      'RGS|1|A',
      'AIS|1|A|CAR_CONSULT^Cardiology Consultation|20240115090000|30|m^Minutes',
      'AIG|1|A|ECG_MACHINE_01^Standard 12-lead ECG',
      'AIL|1|A|ROOM_102^Consultation Suite B',
      'AIP|1|A|DOC_789^DR. CARTER^JOHN^^^MD|CARDIOLOGY',
    ],
    eol,
  );
}

/**
 * HL7 v2.5 standard Negative Acknowledgment (NACK) response with ERR segment.
 * MSA-1: AE (Application Error) or AR (Application Reject).
 * ERR-2: Error Location (Segment ID, Sequence, Field, Component).
 * ERR-3: HL7 Error Code (Table 0357).
 * ERR-4: Severity (E=Error, W=Warning, I=Information).
 */
export function createNegativeAcknowledgmentMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|RECEIVING_EHR|HOSPITAL_B|SENDING_LIS|LAB_A|20240101190000||ACK|MSG_NACK_001|P|2.5',
      'MSA|AE|MSGID_INBOUND_99|Patient Identifier missing or unrecognized',
      'ERR||PID^1^3^1|101^Required field missing^HL70357|E|||Patient MRN is required in PID-3',
    ],
    eol,
  );
}

/**
 * Multi-parameter bedside vital signs flowsheet message (ORU^R01).
 * Carries continuous monitoring observations: Heart Rate, Blood Pressure (Sys/Dia),
 * SpO2, and Body Temperature with abnormal flags (H, L, HH, LL) and reference ranges.
 */
export function createVitalsFlowsheetMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|ICU_VITALS|MONITOR_BED_05|EMR_FLOWSHEET|STATION_A|20240101200000||ORU^R01|MSG_VITALS_001|P|2.3',
      'PID|1||MRN_998811^^^ICU^MR||TAYLOR^JAMES^D||19541203|M',
      'PV1|1|I|ICU^BED05',
      'OBR|1||VS_FLOW_20240101|883-9^Vital Signs Flowsheet^LN|||20240101195500',
      'OBX|1|NM|8867-4^Heart Rate^LN||125|/min|60-100|H|||F|||20240101195500',
      'OBX|2|NM|8480-6^Systolic Blood Pressure^LN||185|mm[Hg]|90-140|HH|||F|||20240101195500',
      'OBX|3|NM|8462-4^Diastolic Blood Pressure^LN||95|mm[Hg]|60-90|H|||F|||20240101195500',
      'OBX|4|NM|2708-6^Oxygen Saturation SpO2^LN||89|%|95-100|L|||F|||20240101195500',
      'OBX|5|NM|8310-5^Body Temperature^LN||38.8|Cel|36.5-37.5|H|||F|||20240101195500',
    ],
    eol,
  );
}

/**
 * Modern HL7 v2.5+ Laboratory Specimen Handling message (ORU^R01 with SPM segment).
 * SPM segment defines specimen container, collection body site, and timestamps
 * preceding analytical OBX results.
 */
export function createSpecimenReportMessage(eol = '\r'): string {
  return joinSegments(
    [
      'MSH|^~\\&|ROCHE_COBAS|LAB_CHEM|EHR_CORE|CENTRAL_HOSP|20240101210000||ORU^R01|MSG_SPM_001|P|2.5',
      'PID|1||MRN_445566^^^LAB^MR||GARCIA^MARIA^C||19790814|F',
      'ORC|RE|ORD_LIS_7001|ACC_LAB_8899||CM',
      'OBR|1|ORD_LIS_7001|ACC_LAB_8899|24323-8^Comprehensive Metabolic Panel^LN|||20240101201500',
      'SPM|1|SPEC_BARCODE_998811||BLD^Whole blood^HL70487||||ARM^Left antecubital fossa^HL70163|||P||||||20240101200000',
      'OBX|1|NM|2951-2^Sodium^LN||139|mmol/L|135-145|N|||F',
      'OBX|2|NM|2823-3^Potassium^LN||4.2|mmol/L|3.5-5.0|N|||F',
      'OBX|3|NM|2075-0^Chloride^LN||101|mmol/L|98-107|N|||F',
      'OBX|4|NM|2345-7^Glucose^LN||105|mg/dL|70-99|H|||F',
    ],
    eol,
  );
}

/**
 * HL7 v2 File & Batch Envelope stream enclosing multiple clinical messages.
 * Structured as: FHS -> BHS -> MSH... (Msg 1) -> MSH... (Msg 2) -> BTS -> FTS.
 */
export function createBatchEnvelopeMessage(eol = '\r'): string {
  return joinSegments(
    [
      'FHS|^~\\&|SFTP_EXPORT|COMMUNITY_CLINIC|CENTRAL_EHR|HEALTH_NETWORK|20240101220000||BATCH_DAILY_EXPORT',
      'BHS|^~\\&|SFTP_EXPORT|COMMUNITY_CLINIC|CENTRAL_EHR|HEALTH_NETWORK|20240101220000||BATCH_TRANSACTION_01',
      'MSH|^~\\&|CLINIC_A|LOC_1|CENTRAL_EHR|LOC_0|20240101213000||ADT^A01|MSG_BATCH_001|P|2.3',
      'PID|1||PAT_BATCH_1^^^CLINIC^MR||ANDERSON^DAVID^E||19900215|M',
      'PV1|1|O|CLINIC_OP',
      'MSH|^~\\&|CLINIC_A|LOC_1|CENTRAL_EHR|LOC_0|20240101214500||ADT^A08|MSG_BATCH_002|P|2.3',
      'PID|1||PAT_BATCH_2^^^CLINIC^MR||THOMPSON^LISA^M||19850930|F',
      'PV1|1|O|CLINIC_OP',
      'BTS|2|BATCH_TRANSACTION_01_PROCESSED',
      'FTS|1',
    ],
    eol,
  );
}

/**
 * Extracts individual HL7 messages from an HL7 v2 batch file stream.
 * Ignores FHS, BHS, BTS, FTS envelopes and isolates messages starting at each MSH.
 */
export function extractMessagesFromBatch(batchRaw: string, eol = '\r'): string[] {
  const lines = batchRaw.split(/\r?\n|\r/);
  const messages: string[] = [];
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('MSH')) {
      if (currentLines.length > 0) {
        messages.push(currentLines.join(eol));
        currentLines = [];
      }
      currentLines.push(trimmed);
    } else if (
      trimmed.startsWith('FHS') ||
      trimmed.startsWith('BHS') ||
      trimmed.startsWith('BTS') ||
      trimmed.startsWith('FTS')
    ) {
      if (currentLines.length > 0) {
        messages.push(currentLines.join(eol));
        currentLines = [];
      }
    } else if (currentLines.length > 0) {
      currentLines.push(trimmed);
    }
  }

  if (currentLines.length > 0) {
    messages.push(currentLines.join(eol));
  }

  return messages;
}
