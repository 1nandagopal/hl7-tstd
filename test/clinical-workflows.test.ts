import { describe, expect, it } from 'vite-plus/test';
import { HL7 } from '../src/index.ts';
import {
  collectSegmentTypes,
  createAllergyAdtMessage,
  createAppointmentSchedulingMessage,
  createBatchEnvelopeMessage,
  createBedTransferAdtMessage,
  createBillingPatientRegistrationMessage,
  createDiagnosticReportMessage,
  createImmunizationRegistryMessage,
  createMicrobiologyReportMessage,
  createNegativeAcknowledgmentMessage,
  createPatientMergeAdtMessage,
  createPharmacyOrderMessage,
  createRadiologyOrderMessage,
  createSpecimenReportMessage,
  createVitalsFlowsheetMessage,
  extractMessagesFromBatch,
  joinSegments,
  stripMllpFrame,
  wrapInMllpFrame,
} from './helpers.ts';

describe('Real-World HL7 Clinical Workflows', () => {
  it('should transform an inbound clinical message into a compliant outbound ACK response', () => {
    const inboundRaw = createDiagnosticReportMessage();
    const inbound = new HL7(inboundRaw);

    const msh = inbound.getSegment('MSH');
    expect(msh).toBeDefined();
    if (!msh) throw new Error('Expected MSH segment to be defined');

    const incomingControlId = msh.get('MSH.10');
    const sendingApp = msh.get('MSH.3');
    const sendingFac = msh.get('MSH.4');

    expect(incomingControlId).toBe('MSGID1');
    expect(sendingApp).toBe('SENDAPP');
    expect(sendingFac).toBe('SENDFAC');

    // Generate outbound ACK swapping sender and receiver endpoints
    const ackRaw = `MSH|^~\\&|LOCAL_EMR|LOCAL_HOSP|${sendingApp}|${sendingFac}|20240101123100||ACK|ACK_998877|P|2.3`;
    const ack = new HL7(ackRaw);
    const msa = ack.createSegment('MSA');
    msa.set('MSA.1', 'AA'); // Application Accept
    msa.set('MSA.2', incomingControlId);
    msa.set('MSA.3', 'Message received and processed successfully');

    expect(collectSegmentTypes(ack)).toEqual(['MSH', 'MSA']);
    expect(ack.getSegment('MSA')?.get('MSA.1')).toBe('AA');
    expect(ack.getSegment('MSA')?.get('MSA.2')).toBe('MSGID1');
    expect(ack.build()).toMatch(/MSA\|AA\|MSGID1\|Message received and processed successfully/);
  });

  it('should correctly traverse microbiology parent orders and child antimicrobial susceptibility panels', () => {
    const raw = createMicrobiologyReportMessage();
    const hl7 = new HL7(raw);

    const obrPanels = hl7.getSegments('OBR');
    expect(obrPanels).toHaveLength(2);

    const parentBloodCulture = obrPanels[0]!;
    const childAntibiogram = obrPanels[1]!;

    expect(parentBloodCulture.get('OBR.4.1')).toBe('BLOOD_CULTURE');
    expect(childAntibiogram.get('OBR.4.1')).toBe('ANTIBIOGRAM');
    expect(childAntibiogram.get('OBR.15')).toBe('CULT_9901'); // Parent order link

    // Isolate only the parent culture findings (stops before the child antibiogram OBR)
    const cultureFindings = hl7.getSegmentsAfter(parentBloodCulture, 'OBX', ['OBR']);
    expect(cultureFindings).toHaveLength(2);
    expect(cultureFindings[0]?.get('OBX.3.1')).toBe('ISOLATE_1');
    expect(cultureFindings[0]?.get('OBX.5')).toBe('Staphylococcus aureus');

    // Isolate only the child antibiotic sensitivities
    const sensitivities = hl7.getSegmentsAfter(childAntibiogram, 'OBX');
    expect(sensitivities).toHaveLength(4);
    expect(sensitivities.map((s) => s.get('OBX.3.1'))).toEqual([
      'VANCOMYCIN',
      'OXACILLIN',
      'GENTAMICIN',
      'LINEZOLID',
    ]);

    // Inspect MIC values and clinical interpretation (S = Sensitive, R = Resistant)
    expect(sensitivities[0]?.get('OBX.8')).toBe('S'); // Vancomycin Sensitive
    expect(sensitivities[1]?.get('OBX.8')).toBe('R'); // Oxacillin Resistant
  });

  it('should parse and manage multi-policy insurance coverage (primary vs secondary IN1) and billing diagnoses', () => {
    const raw = createBillingPatientRegistrationMessage();
    const hl7 = new HL7(raw);

    const insurancePolicies = hl7.getSegments('IN1');
    expect(insurancePolicies).toHaveLength(2);

    // Primary Insurance
    const primary = insurancePolicies[0]!;
    expect(primary.get('IN1.1')).toBe('1');
    expect(primary.get('IN1.3')).toBe('BLUE CROSS BLUE SHIELD');
    expect(primary.get('IN1.7')).toBe('GRP_998811');

    // Secondary Insurance
    const secondary = insurancePolicies[1]!;
    expect(secondary.get('IN1.1')).toBe('2');
    expect(secondary.get('IN1.3')).toBe('MEDICARE PART B');

    // ICD-10 Diagnosis codes (DG1)
    const diagnoses = hl7.getSegments('DG1');
    expect(diagnoses).toHaveLength(2);
    expect(diagnoses[0]?.get('DG1.3.1')).toBe('I25.10');
    expect(diagnoses[1]?.get('DG1.3.1')).toBe('E11.9');

    // Reindexing insurance policies when secondary becomes primary
    hl7.moveSegmentBefore(secondary, primary);
    hl7.reindexSegments({ IN1: [] });

    expect(hl7.getSegments('IN1')[0]?.get('IN1.3')).toBe('MEDICARE PART B');
    expect(hl7.getSegments('IN1')[0]?.get('IN1.1')).toBe('1');
    expect(hl7.getSegments('IN1')[1]?.get('IN1.3')).toBe('BLUE CROSS BLUE SHIELD');
    expect(hl7.getSegments('IN1')[1]?.get('IN1.1')).toBe('2');
  });

  it('should parse CDC public health pediatric immunization records (VXU^V04)', () => {
    const raw = createImmunizationRegistryMessage();
    const hl7 = new HL7(raw);

    expect(hl7.getSegment('MSH')?.get('MSH.9.1')).toBe('VXU');
    expect(hl7.getSegment('MSH')?.get('MSH.9.2')).toBe('V04');

    const rxa = hl7.getSegment('RXA');
    expect(rxa).toBeDefined();
    if (!rxa) throw new Error('Expected RXA segment to be defined');

    // Vaccine CVX code and description
    expect(rxa.get('RXA.5.1')).toBe('08');
    expect(rxa.get('RXA.5.2')).toBe('Hep B, pediatric or adolescent');
    expect(rxa.get('RXA.6')).toBe('0.5'); // Administered volume
    expect(rxa.get('RXA.7')).toBe('mL'); // Administered units
    expect(rxa.get('RXA.13')).toBe('LOT_9922AA'); // Lot number
    expect(rxa.get('RXA.15.1')).toBe('MSD'); // Manufacturer Merck

    // Injection route and anatomic body site (RXR)
    const rxr = hl7.getSegment('RXR');
    expect(rxr?.get('RXR.1.2')).toBe('Intramuscular');
    expect(rxr?.get('RXR.2.2')).toBe('Left Deltoid');
  });

  it('should parse inpatient medication orders with complex repeating dosing schedules (ORM/RDE)', () => {
    const raw = createPharmacyOrderMessage();
    const hl7 = new HL7(raw);

    const orc = hl7.getSegment('ORC');
    expect(orc).toBeDefined();
    if (!orc) throw new Error('Expected ORC segment to be defined');

    // Repeating dose timing quantity in ORC-7 (TQ timing interval and duration)
    expect(orc.get('ORC.7.2', 0)).toBe('BID');
    expect(orc.get('ORC.7.3', 0)).toBe('202401010800');
    expect(orc.get('ORC.7.2', 1)).toBe('BID');
    expect(orc.get('ORC.7.3', 1)).toBe('202401012000');

    // Prescription details in RXE
    const rxe = hl7.getSegment('RXE');
    expect(rxe?.get('RXE.2.1')).toBe('AMOX_500');
    expect(rxe?.get('RXE.3')).toBe('500');
    expect(rxe?.get('RXE.4')).toBe('mg');
  });

  it('should preserve raw HL7 escape sequences without splitting on escaped delimiters', () => {
    // In HL7 v2: \F\ is field delimiter, \S\ is component delimiter, \.br\ is line break
    const raw = joinSegments([
      'MSH|^~\\&|EMR|HOSP|LAB|CLINIC|20240101||ORU^R01|MSG_ESC_01|P|2.3',
      'PID|1||12345||DOE\\S\\JR^JOHN',
      'OBX|1|TX|CLINICAL_NOTE||Impression: Patient has cough \\F\\ fever \\.br\\ Recommend chest X-ray',
    ]);

    const hl7 = new HL7(raw);

    const pid = hl7.getSegment('PID');
    expect(pid?.get('PID.5.1')).toBe('DOE\\S\\JR'); // \S\ must not split into component 2
    expect(pid?.get('PID.5.2')).toBe('JOHN');

    const obx = hl7.getSegment('OBX');
    // \F\ must not split into field 6
    expect(obx?.get('OBX.5')).toBe(
      'Impression: Patient has cough \\F\\ fever \\.br\\ Recommend chest X-ray',
    );
    expect(obx?.get('OBX.6')).toBeNull();

    expect(hl7.build()).toBe(raw);
  });

  it('should support unwrapping TCP/IP MLLP socket streams into clean HL7 messages', () => {
    const cleanMessage = createDiagnosticReportMessage();
    const framedSocketBuffer = wrapInMllpFrame(cleanMessage);

    // Verify raw frame carries start-block 0x0b and end-block 0x1c 0x0d
    expect(framedSocketBuffer.charCodeAt(0)).toBe(0x0b);
    expect(framedSocketBuffer.charCodeAt(framedSocketBuffer.length - 2)).toBe(0x1c);
    expect(framedSocketBuffer.charCodeAt(framedSocketBuffer.length - 1)).toBe(0x0d);

    // Unwrapping MLLP produces valid HL7 message
    const unwrapped = stripMllpFrame(framedSocketBuffer);
    const hl7 = new HL7(unwrapped);

    expect(hl7.getSegment('MSH')?.get('MSH.9.1')).toBe('ORU');
    expect(hl7.getSegment('PID')?.get('PID.5.1')).toBe('DOE');
    expect(hl7.build()).toBe(cleanMessage);
  });

  it('should parse and process inpatient bed tracking and ward transfers (ADT^A02)', () => {
    const raw = createBedTransferAdtMessage();
    const hl7 = new HL7(raw);

    expect(hl7.getSegment('MSH')?.get('MSH.9.1')).toBe('ADT');
    expect(hl7.getSegment('MSH')?.get('MSH.9.2')).toBe('A02');
    expect(hl7.getSegment('EVN')?.get('EVN.1')).toBe('A02');

    const pv1 = hl7.getSegment('PV1');
    expect(pv1).toBeDefined();
    if (!pv1) throw new Error('Expected PV1 segment to be defined');

    // PV1-3: Assigned Patient Location (PointOfCare^Room^Bed^Facility^^^Building^Floor)
    expect(pv1.get('PV1.3.1')).toBe('ICU');
    expect(pv1.get('PV1.3.2')).toBe('BED02');
    expect(pv1.get('PV1.3.3')).toBe('01');
    expect(pv1.get('PV1.3.4')).toBe('MAIN_HOSP');
    expect(pv1.get('PV1.3.7')).toBe('BUILDING_A');
    expect(pv1.get('PV1.3.8')).toBe('2');

    // PV1-6: Prior Patient Location (where patient was moved from: ED room 01)
    expect(pv1.get('PV1.6.1')).toBe('ED');
    expect(pv1.get('PV1.6.2')).toBe('ROOM01');
    expect(pv1.get('PV1.6.3')).toBe('01');
    expect(pv1.get('PV1.6.7')).toBe('BUILDING_A');
    expect(pv1.get('PV1.6.8')).toBe('1');

    // Simulate transfer from ICU to Stepdown Ward:
    // 1. Prior location becomes previous assigned location
    pv1.set('PV1.6.1', 'ICU');
    pv1.set('PV1.6.2', 'BED02');
    pv1.set('PV1.6.3', '01');
    pv1.set('PV1.6.4', 'MAIN_HOSP');
    pv1.set('PV1.6.7', 'BUILDING_A');
    pv1.set('PV1.6.8', '2');

    // 2. Assign new location in step-down unit
    pv1.set('PV1.3.1', 'STEPDOWN');
    pv1.set('PV1.3.2', 'ROOM10');
    pv1.set('PV1.3.3', '02');
    pv1.set('PV1.3.8', '3');

    // 3. Update event timestamp
    hl7.getSegment('EVN')?.set('EVN.2', '20240101163000');

    expect(pv1.get('PV1.3.1')).toBe('STEPDOWN');
    expect(pv1.get('PV1.6.1')).toBe('ICU');
    expect(pv1.get('PV1.6', 0, true)).toBe('ICU^BED02^01^MAIN_HOSP^^^BUILDING_A^2');
    expect(hl7.build()).toContain(
      'PV1|1|I|STEPDOWN^ROOM10^02^MAIN_HOSP^^^BUILDING_A^3|3||ICU^BED02^01^MAIN_HOSP^^^BUILDING_A^2',
    );
  });

  it('should parse patient identity merge messages (ADT^A40) and reconcile surviving vs obsolete MRNs', () => {
    const raw = createPatientMergeAdtMessage();
    const hl7 = new HL7(raw);

    expect(hl7.getSegment('MSH')?.get('MSH.9.1')).toBe('ADT');
    expect(hl7.getSegment('MSH')?.get('MSH.9.2')).toBe('A40');

    const pid = hl7.getSegment('PID');
    const mrg = hl7.getSegment('MRG');

    expect(pid).toBeDefined();
    expect(mrg).toBeDefined();
    if (!pid || !mrg) throw new Error('Expected PID and MRG segments to be defined');

    // Surviving patient record identifiers in PID-3 (repeating MRN and SSN)
    expect(pid.get('PID.3.1', 0)).toBe('SURVIVOR_9901');
    expect(pid.get('PID.3.4', 0)).toBe('HOSP_MPI');
    expect(pid.get('PID.3.5', 0)).toBe('MR');

    expect(pid.get('PID.3.1', 1)).toBe('111222333');
    expect(pid.get('PID.3.4', 1)).toBe('SSN');
    expect(pid.get('PID.3.5', 1)).toBe('SS');

    // Obsolete merged patient identifier in MRG-1
    expect(mrg.get('MRG.1.1')).toBe('DUPLICATE_4402');
    expect(mrg.get('MRG.1.4')).toBe('HOSP_MPI');
    expect(mrg.get('MRG.1.5')).toBe('MR');
    expect(mrg.get('MRG.7.1')).toBe('WILLIAMS');
    expect(mrg.get('MRG.7.2')).toBe('EMILY');
  });

  it('should parse, filter, and append patient clinical allergy alerts (AL1)', () => {
    const raw = createAllergyAdtMessage();
    const hl7 = new HL7(raw);

    const allergies = hl7.getSegments('AL1');
    expect(allergies).toHaveLength(3);

    // Verify types: DA (Drug), FA (Food), EA (Environmental)
    expect(allergies.map((a) => a.get('AL1.2'))).toEqual(['DA', 'FA', 'EA']);

    // Filter severe life-threatening allergies
    const severeAllergies = allergies.filter((a) => a.get('AL1.4') === 'SV');
    expect(severeAllergies).toHaveLength(2);
    expect(severeAllergies.map((a) => a.get('AL1.3.2'))).toEqual(['Penicillin', 'Peanuts']);

    // Verify repeating reaction symptoms (AL1-5: ANAPHYLAXIS~HIVES)
    const penicillin = allergies[0]!;
    expect(penicillin.get('AL1.5', 0)).toBe('ANAPHYLAXIS');
    expect(penicillin.get('AL1.5', 1)).toBe('HIVES');

    // Clinically append new allergy (Sulfa drug allergy)
    const newAllergy = hl7.createSegmentAfter('AL1', allergies[2]!);
    newAllergy.set('AL1.2', 'DA');
    newAllergy.set('AL1.3.1', 'ALG040');
    newAllergy.set('AL1.3.2', 'Sulfonamides');
    newAllergy.set('AL1.4', 'MO');
    newAllergy.set('AL1.5', 'RASH');

    // Reindex all AL1 segments so set ID (AL1.1) is sequential 1..4
    hl7.reindexSegments({ AL1: [] });

    const updatedAllergies = hl7.getSegments('AL1');
    expect(updatedAllergies).toHaveLength(4);
    expect(updatedAllergies.map((a) => a.get('AL1.1'))).toEqual(['1', '2', '3', '4']);
    expect(updatedAllergies[3]?.get('AL1.3.2')).toBe('Sulfonamides');
  });

  it('should parse radiology imaging orders and handle PACS status updates and DICOM UIDs', () => {
    const raw = createRadiologyOrderMessage();
    const hl7 = new HL7(raw);

    const orc = hl7.getSegment('ORC');
    const obr = hl7.getSegment('OBR');
    const zds = hl7.getSegment('ZDS');

    expect(orc).toBeDefined();
    expect(obr).toBeDefined();
    expect(zds).toBeDefined();
    if (!orc || !obr || !zds) throw new Error('Expected ORC, OBR, and ZDS segments to be defined');

    // Placer and Filler Accession Numbers
    expect(orc.get('ORC.2')).toBe('ORD_PL_8801');
    expect(orc.get('ORC.3')).toBe('ACC_990011');
    expect(obr.get('OBR.18')).toBe('ACC_990011');

    // Procedure details & modality
    expect(obr.get('OBR.4.1')).toBe('71250');
    expect(obr.get('OBR.4.2')).toBe('CT CHEST WITH CONTRAST');
    expect(obr.get('OBR.24')).toBe('CT');

    // DICOM Study Instance UID in ZDS segment
    expect(zds.get('ZDS.1.1')).toBe('1.2.840.113619.2.55.3.6046883.890.1704117600.123');
    expect(zds.get('ZDS.1.2')).toBe('DICOM_STUDY_UID');

    // Technologist starts scan: mutate ORC order control & order status
    orc.set('ORC.1', 'SC'); // Status Change
    orc.set('ORC.5', 'IP'); // In Progress

    expect(hl7.build()).toContain(
      'ORC|SC|ORD_PL_8801|ACC_990011|GROUP_101|IP||1^ONCE^202401011800||20240101170000|ORD_DOC_123',
    );
  });

  it('should parse clinic appointment bookings (SIU^S12) and support rescheduling or cancellations', () => {
    const raw = createAppointmentSchedulingMessage();
    const hl7 = new HL7(raw);

    const sch = hl7.getSegment('SCH');
    const ais = hl7.getSegment('AIS');
    const aig = hl7.getSegment('AIG');
    const ail = hl7.getSegment('AIL');
    const aip = hl7.getSegment('AIP');

    expect(sch).toBeDefined();
    expect(ais).toBeDefined();
    expect(aig).toBeDefined();
    expect(ail).toBeDefined();
    expect(aip).toBeDefined();
    if (!sch || !ais || !aig || !ail || !aip) {
      throw new Error('Expected SCH, AIS, AIG, AIL, and AIP segments to be defined');
    }

    // Appointment Schedule Activity
    expect(sch.get('SCH.1')).toBe('APT_9001');
    expect(sch.get('SCH.6')).toBe('ROUTINE_CHECKUP');
    expect(sch.get('SCH.9')).toBe('30'); // Duration 30 mins
    expect(sch.get('SCH.10.1')).toBe('m');
    expect(sch.get('SCH.11.4')).toBe('20240115090000'); // Start time
    expect(sch.get('SCH.11.5')).toBe('20240115093000'); // End time
    expect(sch.get('SCH.25')).toBe('CONFIRMED');

    // Allocated resources
    expect(ais.get('AIS.3.2')).toBe('Cardiology Consultation');
    expect(aig.get('AIG.3.1')).toBe('ECG_MACHINE_01');
    expect(ail.get('AIL.3.1')).toBe('ROOM_102');
    expect(aip.get('AIP.3.2')).toBe('DR. CARTER');

    // Patient cancels appointment: transform to SIU^S15 (Appointment Cancellation)
    hl7.getSegment('MSH')?.set('MSH.9.2', 'S15');
    sch.set('SCH.25', 'CANCELLED');
    const nte = hl7.createSegmentAfter('NTE', sch);
    nte.set('NTE.1', '1');
    nte.set('NTE.3', 'Patient called to cancel due to weather emergency');

    expect(hl7.getSegment('MSH')?.get('MSH.9.2')).toBe('S15');
    expect(sch.get('SCH.25')).toBe('CANCELLED');
    expect(hl7.build()).toContain('NTE|1||Patient called to cancel due to weather emergency');
  });

  it('should parse and construct HL7 v2.5 negative acknowledgment (NACK) with ERR segment', () => {
    const raw = createNegativeAcknowledgmentMessage();
    const hl7 = new HL7(raw);

    const msa = hl7.getSegment('MSA');
    const err = hl7.getSegment('ERR');

    expect(msa).toBeDefined();
    expect(err).toBeDefined();
    if (!msa || !err) throw new Error('Expected MSA and ERR segments to be defined');

    // MSA-1 Application Error code
    expect(msa.get('MSA.1')).toBe('AE');
    expect(msa.get('MSA.2')).toBe('MSGID_INBOUND_99');

    // ERR-2 Error Location (ERL data type: Segment^Sequence^Field^Component)
    expect(err.get('ERR.2.1')).toBe('PID');
    expect(err.get('ERR.2.2')).toBe('1');
    expect(err.get('ERR.2.3')).toBe('3');
    expect(err.get('ERR.2.4')).toBe('1');

    // ERR-3 HL7 0357 Error Condition
    expect(err.get('ERR.3.1')).toBe('101');
    expect(err.get('ERR.3.2')).toBe('Required field missing');
    expect(err.get('ERR.3.3')).toBe('HL70357');

    // ERR-4 Severity (E = Error)
    expect(err.get('ERR.4')).toBe('E');

    // Programmatically construct an Application Reject (AR) response for invalid timestamp
    const nack = new HL7('MSH|^~\\&|EMR|HOSP|LIS|LAB|20240101200000||ACK|ACK_ERR_2|P|2.5');
    const newMsa = nack.createSegment('MSA');
    newMsa.set('MSA.1', 'AR');
    newMsa.set('MSA.2', 'MSGID_INBOUND_100');
    newMsa.set('MSA.3', 'Date/time format violates HL7 TS specification');

    const newErr = nack.createSegment('ERR');
    newErr.set('ERR.2.1', 'EVN');
    newErr.set('ERR.2.2', '1');
    newErr.set('ERR.2.3', '2');
    newErr.set('ERR.3.1', '102');
    newErr.set('ERR.3.2', 'Data type error');
    newErr.set('ERR.4', 'E');

    expect(nack.build()).toContain(
      'MSA|AR|MSGID_INBOUND_100|Date/time format violates HL7 TS specification',
    );
    expect(nack.build()).toContain('ERR||EVN^1^2|102^Data type error|E');
  });

  it('should extract ICU bedside vital signs flowsheets and filter critical panic values', () => {
    const raw = createVitalsFlowsheetMessage();
    const hl7 = new HL7(raw);

    const obxList = hl7.getSegments('OBX');
    expect(obxList).toHaveLength(5);

    // Map vital signs to structured domain records
    const vitals = obxList.map((obx) => ({
      code: obx.get('OBX.3.1'),
      name: obx.get('OBX.3.2'),
      value: parseFloat(obx.get('OBX.5') ?? '0'),
      units: obx.get('OBX.6'),
      referenceRange: obx.get('OBX.7'),
      abnormalFlag: obx.get('OBX.8'),
      timestamp: obx.get('OBX.14'),
    }));

    // Filter critical / panic alarm values (HH = Critical High, LL = Critical Low)
    const panicValues = vitals.filter((v) => v.abnormalFlag === 'HH' || v.abnormalFlag === 'LL');
    expect(panicValues).toHaveLength(1);
    expect(panicValues[0]?.name).toBe('Systolic Blood Pressure');
    expect(panicValues[0]?.value).toBe(185);
    expect(panicValues[0]?.units).toBe('mm[Hg]');

    // Filter all out-of-range observations (H, L, HH, LL)
    const outOfRange = vitals.filter((v) => v.abnormalFlag && v.abnormalFlag !== 'N');
    expect(outOfRange.map((v) => v.name)).toEqual([
      'Heart Rate',
      'Systolic Blood Pressure',
      'Diastolic Blood Pressure',
      'Oxygen Saturation SpO2',
      'Body Temperature',
    ]);
  });

  it('should parse modern laboratory specimen information (SPM) and associate analytical test results', () => {
    const raw = createSpecimenReportMessage();
    const hl7 = new HL7(raw);

    const spm = hl7.getSegment('SPM');
    expect(spm).toBeDefined();
    if (!spm) throw new Error('Expected SPM segment to be defined');

    // Specimen ID barcode, type, and source site
    expect(spm.get('SPM.2')).toBe('SPEC_BARCODE_998811');
    expect(spm.get('SPM.4.1')).toBe('BLD');
    expect(spm.get('SPM.4.2')).toBe('Whole blood');
    expect(spm.get('SPM.8.1')).toBe('ARM');
    expect(spm.get('SPM.8.2')).toBe('Left antecubital fossa');
    expect(spm.get('SPM.17')).toBe('20240101200000'); // Specimen draw time

    // Associated chemistry panel results following SPM
    const results = hl7.getSegmentsAfter(spm, 'OBX');
    expect(results).toHaveLength(4);
    expect(results.map((r) => r.get('OBX.3.2'))).toEqual([
      'Sodium',
      'Potassium',
      'Chloride',
      'Glucose',
    ]);

    // Elevated glucose flag
    const glucose = results[3]!;
    expect(glucose.get('OBX.3.2')).toBe('Glucose');
    expect(glucose.get('OBX.5')).toBe('105');
    expect(glucose.get('OBX.8')).toBe('H');
  });

  it('should parse and process HL7 batch files by extracting individual clinical messages', () => {
    const batchRaw = createBatchEnvelopeMessage();

    // In HL7 v2 Chapter 2.10, batches wrap multiple transactions between FHS/BHS and BTS/FTS
    const messages = extractMessagesFromBatch(batchRaw);
    expect(messages).toHaveLength(2);

    // Message 1 is an ADT^A01 admission
    const msg1 = new HL7(messages[0]!);
    expect(msg1.getSegment('MSH')?.get('MSH.9.1')).toBe('ADT');
    expect(msg1.getSegment('MSH')?.get('MSH.9.2')).toBe('A01');
    expect(msg1.getSegment('PID')?.get('PID.5.1')).toBe('ANDERSON');

    // Message 2 is an ADT^A08 update
    const msg2 = new HL7(messages[1]!);
    expect(msg2.getSegment('MSH')?.get('MSH.9.1')).toBe('ADT');
    expect(msg2.getSegment('MSH')?.get('MSH.9.2')).toBe('A08');
    expect(msg2.getSegment('PID')?.get('PID.5.1')).toBe('THOMPSON');
  });

  // Standard compliance expectation: per HL7 standard Chapter 2.10, batch streams starting with FHS
  // should ideally be parsed directly by HL7 libraries, but current constructor strictly enforces startsWith('MSH')
  it.fails('should parse batch envelopes starting with FHS directly per HL7 Standard Chapter 2.10', () => {
    const batchRaw = createBatchEnvelopeMessage();
    // Expected to succeed per standard, but fails in current implementation due to startsWith('MSH')
    const hl7 = new HL7(batchRaw);
    expect(hl7.getSegment('FHS')).toBeDefined();
  });
});
