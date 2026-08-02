export function joinSegments(segments, eol = '\r') {
  return segments.join(eol);
}

export function makeOruMessage(eol = '\r') {
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

export function makeAdtMessage(eol = '\r') {
  return joinSegments(
    [
      'MSH|^~\\&|ADTAPP|ADTFAC|RECVAPP|RECVFAC|202401011245||ADT^A01|MSGID2|P|2.3',
      'PID|1||12345^^^MRN||DOE^JOHN',
      'PV1|1|I|WARD^101^1',
    ],
    eol,
  );
}

export function makeCustomDelimitedMessage(eol = '\n') {
  return joinSegments(
    [
      'MSH*^~\\&*SEND*FAC*RECV*RFAC*202401011300**ORU^R01*MSGID3*P*2.3',
      'PID*1**12345^^^MRN**DOE^JANE',
    ],
    eol,
  );
}

export function makeCustomEncodedMessage(eol = '\r') {
  return joinSegments(
    [
      'MSH*@$%?*SEND*FAC*RECV*RFAC*202401011300**ORU@R01*MSGID3*P*2.3',
      'PID*1**12345@@@MRN**DOE@JANE',
      'OBX*1*TX*CODE1@Result**Alpha$Beta',
    ],
    eol,
  );
}

export function makeBaseMessage(eol = '\r') {
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

export function makeSegmentMessage(eol = '\r') {
  return joinSegments(
    [
      'MSH|^~\\&|SEND|SFAC|RECV|RFAC|202401011230||ORU^R01|MSGID1|P|2.3',
      'ZYX|1|A|B|C|Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3',
      'PID|1||12345^^^MRN||DOE^JOHN^A',
    ],
    eol,
  );
}

export function makeGroupedObservationMessage(eol = '\r') {
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

export function segmentTypes(hl7) {
  return hl7.getSegments().map((segment) => segment.type);
}

export function getLastSegmentLine(hl7) {
  return hl7.build().split(hl7.parseOptions.buildEolChar).at(-1);
}
