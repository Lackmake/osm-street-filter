import { evaluateStreet } from './src/filterEngine.js';

const testCases = [
  {
    name: "Access=no on residential street without foot tag",
    tags: { highway: "residential", access: "no" },
    expectedIncluded: false,
    expectedReasonContains: "excluded: access=no"
  },
  {
    name: "Access=no with explicit foot=yes allows pedestrian access",
    tags: { highway: "residential", access: "no", foot: "yes" },
    expectedIncluded: true,
    expectedReasonContains: "included: foot=yes"
  },
  {
    name: "Access=private excludes even with foot=yes",
    tags: { highway: "residential", access: "private", foot: "yes" },
    expectedIncluded: false,
    expectedReasonContains: "excluded: access=private"
  },
  {
    name: "Footway inside Nature Area polygon (Step 8)",
    tags: { highway: "footway" },
    naturePolygons: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    ],
    lineCoords: [[5, 5], [6, 6]],
    expectedIncluded: true,
    expectedReasonContains: "included: footway in nature/park area"
  },
  {
    name: "Footway inside Nature Area with access=no remains excluded",
    tags: { highway: "footway", access: "no" },
    naturePolygons: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    ],
    lineCoords: [[5, 5], [6, 6]],
    expectedIncluded: false,
    expectedReasonContains: "default: excluded"
  }
];

let passed = 0;
for (const tc of testCases) {
  const result = evaluateStreet(tc.tags, tc.naturePolygons || [], tc.lineCoords || []);
  const okIncluded = result.included === tc.expectedIncluded;
  const okReason = result.filter_reason.includes(tc.expectedReasonContains);
  
  if (okIncluded && okReason) {
    console.log(`[PASS] ${tc.name}`);
    console.log(`       Reason trace: "${result.filter_reason}"\n`);
    passed++;
  } else {
    console.error(`[FAIL] ${tc.name}`);
    console.error(`       Expected included: ${tc.expectedIncluded}, got: ${result.included}`);
    console.error(`       Expected reason to contain: "${tc.expectedReasonContains}"`);
    console.error(`       Actual reason trace: "${result.filter_reason}"\n`);
  }
}

console.log(`Results: ${passed} / ${testCases.length} tests passed.`);
