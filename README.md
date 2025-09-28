# hl7-tstd

A simple package to create, parse & transform HL7 message.

```typescript
import HL7, { Segment } from 'hl7-tstd';

const hl7 = new HL7(raw); // raw: raw HL7 message string
```

_Segment_ is only a typescript type.

### parseOptions

Additional configs for hl7 parsing and building.

| Parameter      | Default Value |               Expected                |
| :------------- | :-----------: | :-----------------------------------: |
| fieldDelim     |     `\|`      |               `string`                |
| repeatingDelim |      `~`      |               `string`                |
| componentDelim |      `^`      |               `string`                |
| subCompDelim   |     `\&`      |               `string`                |
| eolDelim       |  `\r?\n\|\r`  | `\r?\n\|\r` \| `\r\n` \| `\n` \| `\r` |
| buildEolChar   |    `\r\n`     |               `string`                |

## API References

<details id="get">
<summary><code>get</code></summary>

Gets the value from a segment.

| Parameter         |   Type   | Requirement  |
| :---------------- | :------: | :----------: |
| field             | `string` | **Required** |
| repeatingIndex    | `number` |  Default: 0  |
| subComponentIndex | `number` |  Default: 0  |

Return: `string` | `null`

```typescript
const zyxSegment = hl7.getSegment('ZYX');

zyxSegment?.get('ZYX.5.2', 1, 2);
```

### Examples

```
ZYX|1|A|B|C|Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3
```

```typescript
// Get entire segment
zyxSegment.get('ZYX'); // ZYX|1|A|B|C|Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3

// Get repeating fields
zyxSegment.get('ZYX.5'); // Repeat1
zyxSegment.get('ZYX.5', 2); // SubComp1&SubComp2^Component2
zyxSegment.get('ZYX.5', -1); // Repeat1~Component1^Component2~SubComp1&SubComp2^Component2~Repeat3

// Get component
zyxSegment.get('ZYX.5.1', 1); // Component1

// Get subcomponent
zyxSegment.get('ZYX.5.1', 2); // SubComp1
zyxSegment.get('ZYX.5.1', 2, 1); // SubComp2
zyxSegment.get('ZYX.5.1', 2, -1); // SubComp1&SubComp2
```

</details>

<details id="set">
<summary><code>set</code></summary>

Sets the value of on a segment.

| Parameter         |   Type   | Requirement  |
| :---------------- | :------: | :----------: |
| field             | `string` | **Required** |
| value             | `string` | **Required** |
| repeatingIndex    | `number` |  Default: 0  |
| subComponentIndex | `number` |  Default: 0  |

```typescript
const zyxSegment = hl7.getSegment('ZYX');

zyxSegment?.set('ZYX.5.2', 'ABCD', 1, 2); // ZYX|||||~^&&ABCD
```

</details>

<details id="getSegment">
<summary><code>getSegment</code></summary>

Returns the first Segment matching the _type_ param or else null.

| Parameter |   Type   | Requirement  |
| :-------- | :------: | :----------: |
| type      | `string` | **Required** |

Return: `Segment` | `null`

```typescript
const pidSegment = hl7.getSegment('PID');

pidSegment?.set('PID.5', 'PAT_NAME');
```

</details>

<details id="getSegments">
<summary><code>getSegments</code></summary>

Returns an array of Segments matching the _type_ parameter, if provided; otherwise, returns an array of all Segments.

| Parameter |   Type   | Requirement |
| :-------- | :------: | :---------: |
| type      | `string` |  Optional   |

Return: `Segment[]`

```typescript
const obrSegments = hl7.getSegments('OBX');

for (const obrSegment of obrSegments) {
  obrSegment.get('OBR.4');
}
```

</details>

<details id="getSegmentsAfter">
<summary><code>getSegmentsAfter</code></summary>

Returns an array of Segments matching the _type_, starting from the _startSegment_ until encountering a segment listed in _stopSegmentType_.  
Setting _consecutive_ as `true` will return first set consecutive of matching Segments.

| Parameter       |    Type    |  Requirement   |
| :-------------- | :--------: | :------------: |
| startSegment    | `Segment`  |  **Required**  |
| type            |  `string`  |  **Required**  |
| stopSegmentType | `string[]` |    Optional    |
| consecutive     | `boolean`  | Default: false |

Return: `Segment[]`

```typescript
const obrSegment = hl7.getSegment('OBX');

const obxAfterObr = hl7.getSegmentsAfter(obrSegment!, 'OBX', ['OBR']);
```

</details>

<details id="createSegment">
<summary><code>createSegment</code></summary>

Created a new segment of given _type_ and appends it at the end of existing segments.

| Parameter |   Type   | Requirement  |
| :-------- | :------: | :----------: |
| type      | `string` | **Required** |

Return: `Segment`

```typescript
const nteSegment = hl7.createSegment('NTE');
```

</details>

<details id="createSegmentAfter">
<summary><code>createSegmentAfter</code></summary>

Created a new segment of given _type_ and inserts it after _targetSegment_ segment.

| Parameter     |   Type    | Requirement  |
| :------------ | :-------: | :----------: |
| type          | `string`  | **Required** |
| targetSegment | `Segment` | **Required** |

Return: `Segment`

```typescript
for (const obxSegment of hl7.getSegments('OBX')) {
  const nteSegment = hl7.createSegmentAfter('NTE', obxSegment);

  nteSegment.set('NTE.3', 'Notes');
}
```

</details>

<details id="createSegmentBefore">
<summary><code>createSegmentBefore</code></summary>

Created a new segment of given _type_ and inserts it before _targetSegment_ segment.

| Parameter     |   Type    | Requirement  |
| :------------ | :-------: | :----------: |
| type          | `string`  | **Required** |
| targetSegment | `Segment` | **Required** |

Return: `Segment`

```typescript
for (const obxSegment of hl7.getSegments('OBX')) {
  const nteSegment = hl7.createSegmentBefore('NTE', obxSegment);

  nteSegment.set('NTE.3', 'Notes');
}
```

</details>

<details id="deleteSegment">
<summary><code>deleteSegment</code></summary>

Deletes an existing _segment_ if found.

| Parameter |   Type    | Requirement  |
| :-------- | :-------: | :----------: |
| segment   | `Segment` | **Required** |

```typescript
const nteSegment = hl7.getSegment('NTE');

if (nteSegment) hl7.deleteSegment(nteSegment);
```

</details>

<details id="deleteSegments">
<summary><code>deleteSegments</code></summary>

Deletes all existing _segments_ if found.

| Parameter |    Type     | Requirement  |
| :-------- | :---------: | :----------: |
| segments  | `Segment[]` | **Required** |

```typescript
const nteSegments = hl7.getSegments('NTE');

hl7.deleteSegments(nteSegments);
```

</details>

<details id="moveSegmentAfter">
<summary><code>moveSegmentAfter</code></summary>

Moves _segment_ after _targetSegment_.

| Parameter     |  Type   | Requirement  |
| :------------ | :-----: | :----------: |
| segment       | Segment | **Required** |
| targetSegment | Segment | **Required** |

</details>

<details id="moveSegmentBefore">
<summary><code>moveSegmentBefore</code></summary>

Moves _segment_ before _targetSegment_.

| Parameter     |  Type   | Requirement  |
| :------------ | :-----: | :----------: |
| segment       | Segment | **Required** |
| targetSegment | Segment | **Required** |

</details>

<details id="reindexSegments">
<summary><code>reindexSegments</code></summary>

Reindexes segments based on _resetRules_.

| Parameter  |  Type  |  Requirement   |
| :--------- | :----: | :------------: |
| resetRules | object |  **Required**  |
| startIndex | number |   Default: 1   |
| field      | string | Default: '1.1' |

**resetRule**

An object where each **key** is a **segment type** and its **value** is an array of **segment types**.
The index of segment types specified in the keys will be set, and it will reset based on the segment types listed in its object value array.

**field**
Segment field where index will be set. Defaults to '1.1'.

Example:

```typescript
hl7.reindexSegments({ OBR: [], OBX: ['OBR'], NTE: ['OBR', 'OBX'] });
```

Here,

- NTE segments will have index restarting from 1 after each OBR or OBX segment is encountered.
- OBR segments will have index starting from one and incrementing since no reset segments were provided.

> _Note:_ `reindexSegments` sets the segment index value. This doesn't move the segments by itself.

</details>

<details id="transform">
<summary><code>transform</code> 💀 </summary>

> ⚠️ **Deprecated**: This method is triggered internally and doesn't need to be invoked manually.

Transforms the raw HL7 message suitable for manipulation and building.

```typescript
hl7.transform(); // depricated
```

</details>

---

### Attribution

This project includes code inspired from [hl7-standard](https://github.com/ironbridgecorp/hl7-standard), licensed under the Apache License 2.0.
