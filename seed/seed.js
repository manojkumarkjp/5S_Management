/* Demo data generator for the 5S Management System.
   Deterministic: generate('2026-10-01') always yields the same dataset.
   Used to seed the shared demo database and the PostgreSQL seed. */
const FS = require('../src/shared.js');
const crypto = require('crypto');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(5512026);
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const chance = (p) => R() < p;
const between = (a, b) => a + Math.floor(R() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (empId, pwd) => crypto.createHash('sha256').update('5s-demo:' + empId + ':' + pwd).digest('hex');

/* ---------------- configuration ---------------- */
function settings() {
  return {
    appTitle: '5S Management System',
    fiscalYearStart: 4, timezone: 'Asia/Kolkata', dateFormat: 'DD-MMM-YYYY', language: 'English',
    sNames: {
      S1: { name: 'Sort', jp: 'Seiri', desc: 'Identify and remove unnecessary items.' },
      S2: { name: 'Set in Order', jp: 'Seiton', desc: 'Arrange required items for easy identification and access.' },
      S3: { name: 'Shine', jp: 'Seiso', desc: 'Keep the workplace clean and spot abnormal conditions.' },
      S4: { name: 'Standardize', jp: 'Seiketsu', desc: 'Set and maintain standards for the first three S.' },
      S5: { name: 'Sustain', jp: 'Shitsuke', desc: 'Keep the discipline and improve continuously.' },
    },
    ratingScale: [
      { value: 5, label: 'Excellent' }, { value: 4, label: 'Good' }, { value: 3, label: 'Acceptable' },
      { value: 2, label: 'Needs Improvement' }, { value: 1, label: 'Poor' },
    ],
    bands: [
      { min: 90, label: 'Excellent', color: '#1b7f45' },
      { min: 80, label: 'Very Good', color: '#5f9f2f' },
      { min: 70, label: 'Good', color: '#c99a06' },
      { min: 60, label: 'Needs Improvement', color: '#dd7a1f' },
      { min: 0, label: 'Poor', color: '#c62f2f' },
    ],
    scoringMethod: 'average', sWeights: { S1: 1, S2: 1, S3: 1, S4: 1, S5: 1 },
    findingThreshold: 2, observationThreshold: 3,
    targetScore: 80, alertScoreThreshold: 70, completionTarget: 95, scoreDropAlert: 10,
    ncClosure: { Critical: 3, Major: 7, Minor: 15, Observation: 30, 'Improvement Opportunity': 45 },
    woTrigger: { Weekly: 2, Fortnightly: 4, Monthly: 7, Quarterly: 14, Custom: 3 },
    woGrace: { Weekly: 1, Fortnightly: 2, Monthly: 3, Quarterly: 7, Custom: 2 },
    auditDueSoonDays: 2, actionDueSoonDays: 3,
    approvals: {
      'Monthly Audit': ['Zone Leader', '5S Facilitator'],
      'Weekly Audit': ['5S Facilitator'],
      'Surprise Audit': ['5S Facilitator', 'Management'],
      'Management Audit': ['Management'],
    },
    numbering: { AUD: '5S-{T}-{YYYY}-{N6}', FND: '5S-{T}-{YYYY}-{N6}', ACT: '5S-{T}-{YYYY}-{N6}', IMP: '5S-{T}-{YYYY}-{N6}' },
    notificationRules: [
      { event: 'Audit assigned', inapp: true, email: true, msg: false, to: 'Auditor' },
      { event: 'Audit due', inapp: true, email: true, msg: false, to: 'Auditor' },
      { event: 'Audit overdue', inapp: true, email: true, msg: true, to: 'Auditor, 5S Facilitator' },
      { event: 'Audit completed', inapp: true, email: true, msg: false, to: 'Zone Leader, 5S Facilitator' },
      { event: 'Audit rejected', inapp: true, email: true, msg: false, to: 'Auditor' },
      { event: 'Action assigned', inapp: true, email: true, msg: false, to: 'Responsible person' },
      { event: 'Action due soon', inapp: true, email: true, msg: false, to: 'Responsible person' },
      { event: 'Action overdue', inapp: true, email: true, msg: true, to: 'Responsible person, Zone Leader' },
      { event: 'Action submitted', inapp: true, email: false, msg: false, to: 'Zone Leader' },
      { event: 'Action rejected', inapp: true, email: true, msg: false, to: 'Responsible person' },
      { event: 'Action verified', inapp: true, email: false, msg: false, to: 'Responsible person' },
      { event: 'Action closed', inapp: true, email: false, msg: false, to: 'Responsible person, Auditor' },
      { event: 'Critical finding created', inapp: true, email: true, msg: true, to: 'Zone Leader, 5S Facilitator, Management' },
    ],
    permissions: defaultPermissions(),
  };
}

function defaultPermissions() {
  // levels: none | view | limited | edit
  const F = ['Dashboard', 'Analytics', '5S Organization', 'Master', 'User Role', 'Audit Planner', 'Work Orders', 'Execute Audit', 'Findings', 'Actions', 'Verify Actions', 'Reports', 'Audit Trail'];
  const M = {
    admin:       ['edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'view'],
    facilitator: ['edit', 'edit', 'edit', 'view', 'none', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'edit', 'view'],
    auditor:     ['view', 'view', 'view', 'view', 'none', 'none', 'view', 'edit', 'edit', 'view', 'none', 'edit', 'none'],
    leader:      ['view', 'view', 'view', 'view', 'none', 'none', 'view', 'none', 'edit', 'edit', 'edit', 'edit', 'none'],
    member:      ['view', 'none', 'view', 'none', 'none', 'none', 'none', 'none', 'view', 'edit', 'none', 'limited', 'none'],
    management:  ['view', 'view', 'view', 'view', 'none', 'view', 'view', 'none', 'view', 'view', 'none', 'edit', 'view'],
  };
  const out = {}; Object.keys(M).forEach((r) => { out[r] = {}; F.forEach((f, i) => (out[r][f] = M[r][i])); });
  return out;
}

function masters() {
  return {
    plants: [
      { id: 'PL1', code: 'PL1', name: 'Plant 1', location: 'Sriperumbudur', status: 'Active' },
      { id: 'PL2', code: 'PL2', name: 'Plant 2', location: 'Hosur', status: 'Active' },
    ],
    apus: [
      { id: 'CU', code: 'CU', name: 'Copper', plant: 'PL1', facilitator: 'APS1010', status: 'Active' },
      { id: 'FB', code: 'FB', name: 'Fiber', plant: 'PL1', facilitator: 'APS1011', status: 'Active' },
      { id: 'PE', code: 'PE', name: 'Power Electronics', plant: 'PL2', facilitator: 'APS1012', status: 'Active' },
      { id: 'SC', code: 'SC', name: 'Semiconductor', plant: 'PL2', facilitator: 'APS1013', status: 'Active' },
    ],
    departments: ['Production', 'Quality', 'Maintenance', 'Warehouse', 'Engineering', 'HR'].map((n, i) => ({ id: 'D' + (i + 1), name: n, status: 'Active' })),
    sections: [
      ['Line 1', 'Production'], ['Line 2', 'Production'], ['Line 3', 'Production'], ['Assembly', 'Production'],
      ['Inspection', 'Quality'], ['Laboratory', 'Quality'], ['Workshop', 'Maintenance'], ['Utilities', 'Maintenance'],
      ['Inbound Stores', 'Warehouse'], ['Outbound Stores', 'Warehouse'], ['Design Office', 'Engineering'], ['Admin Office', 'HR'], ['Amenities', 'HR'],
    ].map(([n, d], i) => ({ id: 'SEC' + (i + 1), name: n, dept: d, status: 'Active' })),
    zoneTypes: ['Production', 'Warehouse', 'Quality', 'Maintenance', 'Office', 'Utility', 'Common Area', 'Canteen', 'Laboratory'],
    riskClasses: ['High', 'Medium', 'Low'],
    severities: [
      { name: 'Critical', color: '#b42318' }, { name: 'Major', color: '#dd6b20' }, { name: 'Minor', color: '#c99a06' },
      { name: 'Observation', color: '#2b6cb0' }, { name: 'Improvement Opportunity', color: '#2f855a' },
    ],
    findingCategories: ['Unneeded items', 'Identification / labelling', 'Storage & location', 'Floor marking', 'Cleanliness', 'Leaks & contamination', 'Visual standards', 'Documentation', 'Discipline / behaviour', 'Safety-related'],
    priorities: ['High', 'Medium', 'Low'],
    auditTypes: ['Monthly Audit', 'Weekly Audit', 'Surprise Audit', 'Management Audit'],
    frequencies: ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Custom'],
    actionTypes: ['Corrective', 'Preventive', 'Improvement'],
    benefits: ['Space saving', 'Time saving', 'Safety improvement', 'Quality improvement', 'Productivity improvement', 'Cost reduction', 'Visual improvement'],
  };
}

/* ---------------- checksheets ---------------- */
const PROD_Q = {
  S1: [['Unneeded items', 'Are unnecessary items removed from the workplace?', 'Walk the zone and look for items not needed for the current shift.'],
       ['Obsolete material', 'Are obsolete materials identified?', 'Obsolete or expired material must carry an identification tag.'],
       ['Red tag', 'Are red-tagged items properly controlled?', 'Check the red-tag log against the holding area.'],
       ['Tools & equipment', 'Are unused tools/equipment removed?', 'Equipment idle for over 30 days should be red-tagged.'],
       ['Excess material', 'Are excess materials removed?', 'WIP above the defined kanban limit is a finding.']],
  S2: [['Tool storage', 'Are tools stored in designated locations?', 'Shadow boards complete, every tool in its outline.'],
       ['Location identification', 'Are locations clearly identified?', 'Every rack, bin and tool position carries a label.'],
       ['Material arrangement', 'Are materials arranged systematically?', 'FIFO lanes respected, heavy items at waist height.'],
       ['Floor marking', 'Are floor markings clearly visible?', 'Yellow aisles, white WIP, red quarantine, no peeling tape.'],
       ['Storage limits', 'Are storage limits defined and followed?', 'Min/max marks present and stock within them.']],
  S3: [['Workplace cleanliness', 'Is the workplace clean?', 'Benches, panels and walkways free of debris.'],
       ['Machine condition', 'Are machines free from oil/dust?', 'Wipe test on guards and control panels.'],
       ['Floor cleanliness', 'Are floors clean?', 'No oil, scrap, swarf or packaging on the floor.'],
       ['Cleaning tools', 'Are cleaning tools properly stored?', 'Cleaning station complete and labelled.'],
       ['Abnormalities', 'Are abnormalities identified?', 'Leaks, loose wiring and damage are tagged.']],
  S4: [['5S standards', 'Are 5S standards displayed?', 'Zone 5S board shows current standard and score.'],
       ['Visual standards', 'Are visual standards available?', 'Photo standards for each workstation are posted.'],
       ['Cleaning standards', 'Are cleaning standards followed?', 'Cleaning checklist signed for the last 7 days.'],
       ['Work instructions', 'Are standard work instructions available?', 'Current revision SWI at the point of use.'],
       ['Sustained improvements', 'Are previous improvements maintained?', 'Compare with the improvement gallery.']],
  S5: [['Regular activity', 'Are 5S activities performed regularly?', 'Daily 5-minute 5S recorded on the zone board.'],
       ['Findings sustained', 'Are previous audit findings sustained?', 'Re-check closed findings from the last audit.'],
       ['Adherence', 'Are employees following 5S standards?', 'Observe two operators for one cycle.'],
       ['Repeat control', 'Are repeated findings controlled?', 'Repeat findings have a root-cause action.'],
       ['Continuous improvement', 'Is continuous improvement demonstrated?', 'At least one Kaizen idea in the last quarter.']],
};
const WH_Q = {
  S1: [['Unneeded items', 'Are non-moving and scrap items removed from racks?', ''], ['Damaged packaging', 'Is damaged packaging segregated?', ''], ['Red tag', 'Are red-tagged items in the hold area only?', ''], ['Empty pallets', 'Are empty pallets returned to the pallet bay?', ''], ['Personal items', 'Are personal items kept out of storage areas?', '']],
  S2: [['Bin location', 'Are bin locations labelled and matching the WMS?', ''], ['FIFO', 'Is FIFO followed in every lane?', ''], ['Aisle marking', 'Are aisles and pallet positions marked?', ''], ['Stacking limits', 'Are stacking height limits displayed and followed?', ''], ['MHE parking', 'Are forklifts and trolleys parked in marked bays?', '']],
  S3: [['Floor', 'Are floors free of debris and shrink-wrap?', ''], ['Racks', 'Are racks and beams free from dust?', ''], ['Dock area', 'Is the dock area clean?', ''], ['Cleaning kit', 'Is the cleaning kit complete and stored?', ''], ['Damage', 'Are rack damages reported and tagged?', '']],
  S4: [['Layout', 'Is the warehouse layout displayed and current?', ''], ['Standards', 'Are visual storage standards posted?', ''], ['Checklists', 'Are daily checklists completed?', ''], ['Labels', 'Is the label standard consistent across racks?', ''], ['Improvements', 'Are previous improvements maintained?', '']],
  S5: [['Routine', 'Is the daily 5S routine followed?', ''], ['Findings', 'Are previous audit findings sustained?', ''], ['Training', 'Are new staff trained on 5S?', ''], ['Repeats', 'Are repeated findings controlled?', ''], ['Ideas', 'Are improvement ideas raised by the team?', '']],
};
const OFF_Q = {
  S1: [['Desks', 'Are desks free of unneeded files and items?', ''], ['Shared areas', 'Are shared cupboards free of obsolete records?', ''], ['Equipment', 'Is unused equipment removed?', '']],
  S2: [['Files', 'Are files labelled and stored by system?', ''], ['Stationery', 'Is stationery kept in marked locations?', ''], ['Cables', 'Are cables routed and tied?', '']],
  S3: [['Cleanliness', 'Are floors, desks and pantry clean?', ''], ['Waste', 'Is waste segregated in labelled bins?', ''], ['Abnormalities', 'Are faults (lights, AC, furniture) reported?', '']],
  S4: [['Standards', 'Is the area 5S standard displayed?', ''], ['Clean desk', 'Is the clean-desk standard followed?', ''], ['Checklists', 'Are housekeeping checklists completed?', '']],
  S5: [['Routine', 'Are 5S activities carried out regularly?', ''], ['Findings', 'Are previous findings sustained?', ''], ['Engagement', 'Does the team take part in 5S reviews?', '']],
};

function buildQuestions(def, opts = {}) {
  const qs = [];
  FS.S_KEYS.forEach((s) => def[s].forEach(([sub, text, guidance], i) => {
    const qid = s + '-' + String(i + 1).padStart(2, '0');
    qs.push({
      qid, s, sub, text, desc: '', guidance: guidance || '', max: 5, min: 1, weight: 1,
      mandatory: true, evidence: false, photo: (opts.photoQs || []).includes(qid), findingReq: true, active: true, rtype: 'score',
    });
  }));
  return qs;
}

function checksheets() {
  const v1 = buildQuestions(PROD_Q);
  const v2 = buildQuestions(PROD_Q, { photoQs: ['S1-03', 'S2-01', 'S3-02'] });
  const s45 = v2.find((q) => q.qid === 'S4-05'); s45.text = 'Are previous improvements maintained and visible on the 5S board?'; s45.guidance = 'Compare the zone with its before/after gallery; the 5S board must show the latest Kaizen.';
  v2.find((q) => q.qid === 'S2-04').guidance = 'Yellow aisles 100 mm, white WIP 50 mm, red quarantine. No peeling or faded tape.';
  v1.find((q) => q.qid === 'S5-05').weight = 1;
  const wh = buildQuestions(WH_Q, { photoQs: ['S2-01'] });
  const off = buildQuestions(OFF_Q);
  off.forEach((q) => { if (q.qid === 'S3-03') q.mandatory = false; });
  return [
    { id: 'CS-PROD-V1', family: 'CS-PROD', name: 'Production Area – Monthly 5S Audit', version: '1.0', status: 'Superseded', zoneTypes: ['Production', 'Quality', 'Maintenance', 'Laboratory', 'Utility'], effectiveFrom: '2026-01-01', effectiveTo: '2026-06-30', createdBy: 'APS1001', createdAt: '2025-12-20T10:00:00Z', questions: v1, changeNote: 'Initial release' },
    { id: 'CS-PROD-V2', family: 'CS-PROD', name: 'Production Area – Monthly 5S Audit', version: '2.0', status: 'Active', zoneTypes: ['Production', 'Quality', 'Maintenance', 'Laboratory', 'Utility'], effectiveFrom: '2026-07-01', effectiveTo: '', createdBy: 'APS1001', createdAt: '2026-06-24T09:30:00Z', questions: v2, changeNote: 'S4-05 reworded; photo mandatory on S1-03, S2-01, S3-02; floor-marking guidance updated' },
    { id: 'CS-WH-V1', family: 'CS-WH', name: 'Warehouse & Stores 5S Audit', version: '1.0', status: 'Active', zoneTypes: ['Warehouse'], effectiveFrom: '2026-01-01', effectiveTo: '', createdBy: 'APS1001', createdAt: '2025-12-20T10:00:00Z', questions: wh, changeNote: 'Initial release' },
    { id: 'CS-OFF-V1', family: 'CS-OFF', name: 'Office & Common Area 5S Audit', version: '1.0', status: 'Active', zoneTypes: ['Office', 'Canteen', 'Common Area'], effectiveFrom: '2026-01-01', effectiveTo: '', createdBy: 'APS1001', createdAt: '2025-12-20T10:00:00Z', questions: off, changeNote: 'Initial release' },
  ];
}

/* ---------------- people ---------------- */
const FIRST = ['Arun', 'Priya', 'Karthik', 'Divya', 'Suresh', 'Lakshmi', 'Vignesh', 'Anitha', 'Rajesh', 'Deepa', 'Senthil', 'Nithya', 'Manoj', 'Revathi', 'Ganesh', 'Sangeetha', 'Prakash', 'Bhavani', 'Dinesh', 'Kavya', 'Murali', 'Swathi', 'Ashok', 'Pooja', 'Hari', 'Janani', 'Bala', 'Meena', 'Sathish', 'Harini', 'Vinoth', 'Gayathri', 'Naveen', 'Shalini', 'Ramesh', 'Keerthana', 'Mohan', 'Aishwarya', 'Saravanan', 'Ramya', 'Kumar', 'Sowmya', 'Ajay', 'Nandhini', 'Siva', 'Preethi', 'Gopal', 'Vidya', 'Anand', 'Uma'];
const LAST = ['Kumar', 'Raman', 'Subramanian', 'Krishnan', 'Natarajan', 'Iyer', 'Pillai', 'Reddy', 'Nair', 'Rao', 'Murugan', 'Srinivasan', 'Venkatesh', 'Balaji', 'Chandran', 'Gopalan', 'Shankar', 'Menon', 'Prasad', 'Selvam'];

function zonesDef() {
  return [
    ['CU', 'CU-P01', 'Wire Drawing Line 1', 'Production', 'Line 1', 'Production', 'High', 'Bay A, Plant 1'],
    ['CU', 'CU-P02', 'Wire Drawing Line 2', 'Production', 'Line 2', 'Production', 'High', 'Bay A, Plant 1'],
    ['CU', 'CU-P03', 'Annealing & Stranding', 'Production', 'Line 3', 'Production', 'High', 'Bay B, Plant 1'],
    ['CU', 'CU-Q01', 'Final Inspection', 'Quality', 'Inspection', 'Quality', 'Medium', 'Bay C, Plant 1'],
    ['CU', 'CU-W01', 'Raw Material Warehouse', 'Warehouse', 'Inbound Stores', 'Warehouse', 'Medium', 'Stores Block 1'],
    ['CU', 'CU-M01', 'Maintenance Workshop', 'Maintenance', 'Workshop', 'Maintenance', 'Medium', 'Utility Block, Plant 1'],
    ['FB', 'FB-P01', 'Preform Draw Tower', 'Production', 'Line 1', 'Production', 'High', 'Tower Hall, Plant 1'],
    ['FB', 'FB-P02', 'Fiber Cabling Line', 'Production', 'Line 2', 'Production', 'Medium', 'Hall F2, Plant 1'],
    ['FB', 'FB-Q01', 'Optical Test Lab', 'Quality', 'Laboratory', 'Laboratory', 'Medium', 'Lab Wing, Plant 1'],
    ['FB', 'FB-W01', 'Finished Goods Warehouse', 'Warehouse', 'Outbound Stores', 'Warehouse', 'Medium', 'Dispatch Block, Plant 1'],
    ['FB', 'FB-M01', 'Compressor & Utility Room', 'Maintenance', 'Utilities', 'Utility', 'High', 'Utility Block, Plant 1'],
    ['FB', 'FB-O01', 'Engineering Office', 'Engineering', 'Design Office', 'Office', 'Low', 'Admin Block, Plant 1'],
    ['PE', 'PE-P01', 'SMT Line 1', 'Production', 'Line 1', 'Production', 'High', 'Clean Hall 1, Plant 2'],
    ['PE', 'PE-P02', 'Assembly Area', 'Production', 'Assembly', 'Production', 'High', 'Hall 2, Plant 2'],
    ['PE', 'PE-P03', 'Potting & Curing', 'Production', 'Line 3', 'Production', 'Medium', 'Hall 3, Plant 2'],
    ['PE', 'PE-Q01', 'Final Inspection & Burn-in', 'Quality', 'Inspection', 'Quality', 'Medium', 'Hall 4, Plant 2'],
    ['PE', 'PE-W01', 'Component Stores', 'Warehouse', 'Inbound Stores', 'Warehouse', 'Medium', 'Stores, Plant 2'],
    ['PE', 'PE-C01', 'Canteen', 'HR', 'Amenities', 'Canteen', 'Low', 'Amenities Block, Plant 2'],
    ['SC', 'SC-P01', 'Wafer Preparation', 'Production', 'Line 1', 'Production', 'High', 'Fab Hall, Plant 2'],
    ['SC', 'SC-P02', 'Die Attach & Wire Bonding', 'Production', 'Line 2', 'Production', 'High', 'Fab Hall, Plant 2'],
    ['SC', 'SC-Q01', 'Reliability Lab', 'Quality', 'Laboratory', 'Laboratory', 'Medium', 'Lab Wing, Plant 2'],
    ['SC', 'SC-W01', 'Chemical Store', 'Warehouse', 'Inbound Stores', 'Warehouse', 'High', 'Chemical Yard, Plant 2'],
    ['SC', 'SC-M01', 'Facilities Workshop', 'Maintenance', 'Workshop', 'Maintenance', 'Medium', 'Utility Block, Plant 2'],
    ['SC', 'SC-O01', 'Admin & HR Office', 'HR', 'Admin Office', 'Office', 'Low', 'Admin Block, Plant 2'],
  ];
}

function people(zdefs) {
  const users = []; let nameIdx = 0;
  const nextName = () => { const f = FIRST[nameIdx % FIRST.length]; const l = LAST[(nameIdx * 7 + 3) % LAST.length]; nameIdx++; return f + ' ' + l; };
  const apuPlant = { CU: 'PL1', FB: 'PL1', PE: 'PL2', SC: 'PL2' };
  const add = (u) => {
    const n = users.length;
    users.push(Object.assign({
      email: u.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
      mobile: '+91 9' + String(840000000 + n * 104729).slice(0, 9),
      status: 'Active', joinDate: FS.addDays('2014-06-01', between(0, 3600)), section: '', pwd: hash(u.id, 'Demo@123'),
    }, u));
  };
  add({ id: 'APS1001', name: 'Ravi Shankar', dept: 'Engineering', designation: 'System Administrator', role: 'admin', plant: 'PL1', plants: ['PL1', 'PL2'], apus: ['CU', 'FB', 'PE', 'SC'], manager: 'APS1002' });
  add({ id: 'APS1002', name: 'Meenakshi Iyer', dept: 'Production', designation: 'Plant Head', role: 'management', plant: 'PL1', plants: ['PL1', 'PL2'], apus: ['CU', 'FB', 'PE', 'SC'], manager: '' });
  add({ id: 'APS1003', name: 'Arvind Rao', dept: 'Production', designation: 'Operations Director', role: 'management', plant: 'PL2', plants: ['PL1', 'PL2'], apus: ['CU', 'FB', 'PE', 'SC'], manager: 'APS1002' });
  add({ id: 'APS1004', name: 'Kavitha Raman', dept: 'Quality', designation: 'Head – Quality & Excellence', role: 'management', plant: 'PL1', plants: ['PL1', 'PL2'], apus: ['CU', 'FB', 'PE', 'SC'], manager: 'APS1002' });
  [['APS1010', 'Sundar Rajan', 'CU'], ['APS1011', 'Lavanya Krishnan', 'FB'], ['APS1012', 'Prabhu Venkatesh', 'PE'], ['APS1013', 'Shruthi Menon', 'SC']].forEach(([id, name, apu]) =>
    add({ id, name, dept: 'Quality', designation: '5S Facilitator – ' + ({ CU: 'Copper', FB: 'Fiber', PE: 'Power Electronics', SC: 'Semiconductor' })[apu], role: 'facilitator', plant: apuPlant[apu], plants: [apuPlant[apu]], apus: [apu], manager: 'APS1004' }));
  const auditorNames = ['Bharath Kumar', 'Nisha Pillai', 'Rohit Nair', 'Archana Subramanian', 'Imran Basha', 'Deepika Rao', 'Venkat Raghavan', 'Fathima Begum'];
  auditorNames.forEach((name, i) => add({ id: 'APS10' + (20 + i), name, dept: pick(['Quality', 'Engineering', 'Maintenance', 'Production']), designation: pick(['Senior Engineer – TPM', 'Lead Auditor – 5S', 'Engineer – Quality Systems', 'Assistant Manager – Lean']), role: 'auditor', plant: i < 4 ? 'PL1' : 'PL2', plants: ['PL1', 'PL2'], apus: ['CU', 'FB', 'PE', 'SC'], manager: 'APS1004' }));
  const zoneTeams = {};
  zdefs.forEach(([apu, code, , dept, section], zi) => {
    const lid = 'APS' + (1101 + zi);
    add({ id: lid, name: nextName(), dept, section, designation: pick(['Shift Supervisor', 'Line Leader', 'Section In-charge', 'Assistant Manager']), role: 'leader', plant: apuPlant[apu], plants: [apuPlant[apu]], apus: [apu], manager: users.find((u) => u.role === 'facilitator' && u.apus[0] === apu).id });
    const mem = [];
    const nm = zi % 3 === 0 ? 3 : 2;
    for (let k = 0; k < nm; k++) {
      const mid = 'APS' + (1201 + zi * 3 + k);
      add({ id: mid, name: nextName(), dept, section, designation: pick(['Operator', 'Senior Operator', 'Technician', 'Associate', 'Store Keeper']), role: 'member', plant: apuPlant[apu], plants: [apuPlant[apu]], apus: [apu], manager: lid });
      mem.push(mid);
    }
    zoneTeams[code] = { leader: lid, members: mem };
  });
  // a few inactive users for realism
  users.find((u) => u.id === 'APS1205').status = 'Inactive';
  return { users, zoneTeams };
}

/* ---------------- finding text library ---------------- */
const FIND_TXT = {
  S1: ['Scrap reels and offcuts stored beside the machine', 'Obsolete drawing dies kept on the bench without tags', 'Red-tag items lying outside the holding area for over 2 weeks', 'Unused trolley and spare guard parked in the walkway', 'WIP above kanban limit at the outfeed', 'Personal items and empty bottles on the workstation', 'Expired consumables found in the cabinet'],
  S2: ['Tool identification missing on shadow board', 'Rack labels missing on bins 3 and 4', 'Material stacked without FIFO sequence', 'Floor marking faded and peeling near the exit aisle', 'No min/max marking on consumable rack', 'Spanners not returned to their outlines', 'Trolley parking bay not marked'],
  S3: ['Oil leakage below the hydraulic unit', 'Dust accumulation on the control panel', 'Wire scrap and swarf on the floor around the capstan', 'Cleaning tools kept on the floor, not on the cleaning station', 'Coolant leak not tagged or reported', 'Cobwebs and dust on the cable trays', 'Spilled compound around the dispensing station'],
  S4: ['5S zone board not updated since last audit', 'Visual standard photo missing for workstation 2', 'Cleaning checklist not filled for 4 days', 'Work instruction at station is an old revision', 'Improvement from the previous Kaizen not maintained', 'Zone layout display outdated after line change'],
  S5: ['Daily 5-minute 5S not recorded for the week', 'Last audit finding on tool storage has reappeared', 'Operators not following the clean-as-you-go standard', 'Repeat finding with no root-cause action raised', 'No improvement idea recorded this quarter', 'New operators not briefed on zone 5S standard'],
};
const ROOT = ['No defined owner for the area after shift change', 'Standard not communicated to the new shift', 'Insufficient storage provision for the new part family', 'Label material not suited to the oily environment', 'Cleaning frequency not adequate for current output', 'No visual cue for the correct location', 'Daily 5S check not built into the shift handover'];
const CA = ['Removed items, red-tagged and moved to holding area', 'Relabelled locations with industrial-grade labels', 'Repainted floor marking with epoxy paint', 'Cleaned the area and fixed the leak at source', 'Updated the 5S board and visual standards', 'Retrained operators on the zone standard', 'Installed shadow board with tool outlines'];
const PA = ['Added the check to the shift handover checklist', 'Weekly verification by zone leader for 4 weeks', 'Included the item in the layered process audit', 'Standardised label specification across all zones', 'Added leak inspection to the autonomous maintenance sheet', 'Created a one-point lesson and briefed all shifts'];
const FORCE_CRIT = {
  'CU-P03|2026-09|S3-03': 'Oil spill across the walkway near the annealer – slip hazard',
  'SC-W01|2026-09|S2-03': 'Acid and solvent containers stored on the same rack',
  'PE-P02|2026-08|S1-04': 'Unused trolley blocking the emergency exit route',
  'FB-M01|2026-09|S3-05': 'Compressor oil leak not tagged, oil reaching the drain',
};
const IMMEDIATE = ['Area cleaned and items removed on the spot', 'Temporary label placed', 'Leak contained with tray', 'Items moved to red-tag area', 'Operator briefed on the spot', 'None – planned action'];

/* ---------------- illustrations (SVG data URLs for demo photos) ---------------- */
function illus(s, state, seed) {
  const r = rng(seed); const rr = (a, b) => a + r() * (b - a);
  let body = '';
  const floor = '<rect width="240" height="180" fill="#d7d9d6"/><rect width="240" height="70" fill="#ece8de"/>';
  if (s === 'S1') {
    if (state === 'before') for (let i = 0; i < 9; i++) { const x = rr(10, 200), y = rr(70, 150), w = rr(18, 40), h = rr(14, 30); body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${['#a77b4f', '#8a6a46', '#6f7a83', '#b98d5b'][i % 4]}" transform="rotate(${rr(-25, 25)} ${x} ${y})"/>`; if (i % 3 === 0) body += `<rect x="${x + 3}" y="${y + 3}" width="9" height="12" fill="#d62828"/>`; }
    else { for (let i = 0; i < 3; i++) body += `<rect x="${30 + i * 44}" y="96" width="38" height="34" fill="#a77b4f"/><rect x="${30 + i * 44}" y="96" width="38" height="5" fill="#8a6a46"/>`; body += '<rect x="22" y="88" width="146" height="50" fill="none" stroke="#f2b705" stroke-width="4"/>'; }
  } else if (s === 'S2') {
    body += '<rect x="40" y="16" width="160" height="90" fill="#5b6770"/>';
    const tools = [[60, 30, 8, 46], [84, 30, 6, 40], [104, 34, 18, 18], [134, 30, 10, 50], [160, 32, 22, 12]];
    tools.forEach(([x, y, w, h], i) => {
      if (state === 'after') { body += `<rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" fill="#f1f1f1"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#c43c2e"/><rect x="${x - 2}" y="${y + h + 6}" width="${w + 6}" height="6" fill="#ffffff"/>`; }
      else if (i % 2 === 0) body += `<rect x="${x + rr(-10, 10)}" y="${y + rr(0, 30)}" width="${w}" height="${h}" fill="#c43c2e" transform="rotate(${rr(-40, 40)} ${x} ${y})"/>`;
    });
    if (state === 'before') body += '<rect x="20" y="140" width="40" height="8" fill="#c43c2e" transform="rotate(20 20 140)"/><rect x="160" y="150" width="30" height="7" fill="#7d8790"/>';
    body += state === 'after' ? '<rect x="0" y="160" width="240" height="6" fill="#f2b705"/>' : '<rect x="0" y="160" width="70" height="6" fill="#e7cf7a"/><rect x="110" y="160" width="40" height="6" fill="#e7cf7a"/>';
  } else if (s === 'S3') {
    body += '<rect x="60" y="40" width="120" height="90" fill="#4f6d7a"/><rect x="72" y="52" width="40" height="26" fill="#a7c4cf"/><rect x="130" y="56" width="36" height="8" fill="#2f3f47"/>';
    if (state === 'before') { for (let i = 0; i < 5; i++) body += `<ellipse cx="${rr(40, 200)}" cy="${rr(140, 170)}" rx="${rr(10, 26)}" ry="${rr(4, 9)}" fill="#3b2f20" opacity=".75"/>`; for (let i = 0; i < 30; i++) body += `<circle cx="${rr(62, 178)}" cy="${rr(42, 128)}" r="1.4" fill="#8f7f62"/>`; }
    else body += '<rect x="76" y="56" width="10" height="18" fill="#ffffff" opacity=".7"/><rect x="60" y="134" width="120" height="4" fill="#9aa5a8"/>';
  } else if (s === 'S4') {
    body += '<rect x="50" y="18" width="140" height="96" fill="#7b5a3a"/><rect x="56" y="24" width="128" height="84" fill="#e9e3d2"/>';
    if (state === 'after') { body += '<rect x="64" y="30" width="54" height="72" fill="#ffffff"/><rect x="64" y="30" width="54" height="10" fill="#1d5d90"/>'; for (let i = 0; i < 6; i++) body += `<rect x="126" y="${34 + i * 11}" width="50" height="4" fill="#5f6b75"/><rect x="126" y="${34 + i * 11}" width="5" height="4" fill="#1b7f45"/>`; }
    else body += '<polygon points="70,32 110,30 104,70 72,64" fill="#ffffff" opacity=".7"/><rect x="130" y="40" width="30" height="40" fill="#f4f0e4" transform="rotate(14 130 40)"/>';
  } else {
    if (state === 'after') { body += '<rect x="0" y="100" width="240" height="7" fill="#f2b705"/><rect x="0" y="150" width="240" height="7" fill="#f2b705"/><circle cx="206" cy="40" r="16" fill="#1b7f45"/><path d="M198 40 l6 6 l11 -12" stroke="#fff" stroke-width="4" fill="none"/>'; }
    else { for (let i = 0; i < 8; i++) body += `<rect x="${i * 30 + rr(0, 8)}" y="100" width="${rr(6, 18)}" height="7" fill="#e3d18e"/><rect x="${i * 30 + rr(0, 8)}" y="150" width="${rr(4, 14)}" height="7" fill="#e3d18e"/>`; }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">${floor}${body}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/* ---------------- main generator ---------------- */
function generate(today = '2026-10-01') {
  const st = settings(); const ms = masters(); const css = checksheets();
  const zdefs = zonesDef();
  const { users, zoneTeams } = people(zdefs);
  const csFor = (type) => type === 'Warehouse' ? 'CS-WH' : (['Office', 'Canteen', 'Common Area'].includes(type) ? 'CS-OFF' : 'CS-PROD');

  const zones = zdefs.map(([apu, code, name, dept, section, type, risk, location], i) => {
    const team = zoneTeams[code];
    return {
      id: code, code, name, desc: `${name} – ${type.toLowerCase()} zone of the ${ms.apus.find((a) => a.id === apu).name} APU.`,
      plant: ms.apus.find((a) => a.id === apu).plant, apu, dept, section, location, type, risk,
      leader: team.leader, backup: team.members[0], members: team.members, area: between(6, 48) * 25,
      frequency: 'Monthly', duration: type === 'Office' || type === 'Canteen' ? 30 : (risk === 'High' ? 60 : 45),
      checksheet: csFor(type), status: 'Active', effFrom: '2026-01-01', effTo: '', media: [],
    };
  });
  // zone standard illustrations
  zones.forEach((z, i) => { z.media = [{ id: 'ZM-' + z.id, thumb: illus(FS.S_KEYS[i % 5], 'after', 900 + i), inline: true, kind: '5S standard photo', caption: 'Visual standard (illustration)' }]; });

  // zone performance profiles
  const prof = {}; zones.forEach((z, i) => {
    prof[z.id] = { base: 3.35 + R() * 1.15, trend: 0.03 + R() * 0.06, sb: { S1: R() * 0.5 - 0.1, S2: R() * 0.5 - 0.2, S3: R() * 0.5 - 0.15, S4: R() * 0.4 - 0.45, S5: R() * 0.4 - 0.6 } };
  });
  prof['CU-P03'] = { base: 4.3, trend: -0.02, sb: { S1: 0.1, S2: -0.3, S3: 0, S4: -0.3, S5: -0.4 }, drop: { '2026-08': -0.35, '2026-09': -0.75 } };
  prof['PE-P01'] = { base: 4.55, trend: 0.05, sb: { S1: 0.3, S2: 0.2, S3: 0.25, S4: 0.05, S5: 0 } };
  prof['FB-Q01'] = { base: 4.4, trend: 0.06, sb: { S1: 0.2, S2: 0.3, S3: 0.2, S4: 0.1, S5: -0.1 } };
  prof['SC-W01'] = { base: 3.6, trend: 0.02, sb: { S1: 0.2, S2: 0.1, S3: 0.1, S4: -0.2, S5: -0.2 }, s5drop: true };
  prof['PE-P02'] = { base: 3.45, trend: 0.07, sb: { S1: 0, S2: -0.1, S3: -0.5, S4: -0.3, S5: -0.4 } };

  const auditors = users.filter((u) => u.role === 'auditor').map((u) => u.id);
  const days = [3, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 7, 4];
  const schedules = zones.map((z, i) => ({
    id: 'SCH-' + String(i + 1).padStart(4, '0'), zone: z.id, plant: z.plant, apu: z.apu, dept: z.dept,
    checksheet: z.checksheet, frequency: 'Monthly', interval: 30, startDate: '2026-04-' + String(days[i]).padStart(2, '0'), endDate: '2027-03-31',
    time: ['09:30', '10:00', '11:00', '14:30', '15:00'][i % 5], endTime: ['10:30', '11:00', '12:00', '15:30', '16:00'][i % 5],
    auditor: auditors[i % auditors.length], backup: auditors[(i + 3) % auditors.length], priority: z.risk === 'High' ? 'High' : 'Medium',
    auditType: 'Monthly Audit', status: 'Active', createdBy: 'APS101' + ['CU', 'FB', 'PE', 'SC'].indexOf(z.apu), createdAt: '2026-03-20T10:00:00Z',
  }));
  schedules.push({ id: 'SCH-0025', zone: 'CU-P03', plant: 'PL1', apu: 'CU', dept: 'Production', checksheet: 'CS-PROD', frequency: 'Weekly', interval: 7, startDate: '2026-09-28', endDate: '2026-12-31', time: '08:30', endTime: '09:15', auditor: 'APS1020', backup: 'APS1021', priority: 'High', auditType: 'Weekly Audit', status: 'Active', createdBy: 'APS1010', createdAt: '2026-09-24T16:10:00Z', note: 'Weekly follow-up after score drop in Aug/Sep' });
  schedules.push({ id: 'SCH-0026', zone: 'PE-P02', plant: 'PL2', apu: 'PE', dept: 'Production', checksheet: 'CS-PROD', frequency: 'Quarterly', interval: 90, startDate: '2026-07-20', endDate: '2027-03-31', time: '15:00', endTime: '16:30', auditor: 'APS1003', backup: 'APS1004', priority: 'Medium', auditType: 'Management Audit', status: 'Active', createdBy: 'APS1012', createdAt: '2026-06-30T12:00:00Z' });

  const csById = Object.fromEntries(css.map((c) => [c.id, c]));
  const activeCs = (family, date) => css.filter((c) => c.family === family && c.effectiveFrom <= date && (!c.effectiveTo || c.effectiveTo >= date)).sort((a, b) => b.version.localeCompare(a.version))[0] || css.find((c) => c.family === family && c.status === 'Active');

  // occurrences
  const occ = [];
  schedules.forEach((s) => {
    const trig = st.woTrigger[s.frequency] || 7;
    FS.occurrences(s, '2026-04-01', FS.addDays(today, trig)).forEach((d) => occ.push({ s, d }));
  });
  occ.sort((a, b) => (a.d + a.s.id).localeCompare(b.d + b.s.id));

  const workorders = [], findings = [], actions = [], notifications = [];
  let nAud = 0, nF = 0, nA = 0;
  const fmt = (k, y, n) => FS.formatNo(st.numbering[k], k, y, n);
  const repeatForce = { 'CU-P03': { qid: 'S2-02', months: ['2026-06', '2026-07', '2026-08', '2026-09'], text: 'Tool identification missing on shadow board' },
    'PE-P02': { qid: 'S3-02', months: ['2026-07', '2026-08', '2026-09'], text: 'Dust accumulation on the control panel' },
    'SC-W01': { qid: 'S2-04', months: ['2026-08', '2026-09'], text: 'Aisle marking faded near dock 2' } };
  const notExecuted = ['FB-O01|2026-09', 'SC-M01|2026-09'];
  const inProgress = ['PE-W01|2026-09'];
  let photoSeed = 1;

  occ.forEach(({ s, d }) => {
    const z = zones.find((x) => x.id === s.zone); const mk = FS.monthKey(d);
    const cs = activeCs(s.checksheet, d);
    nAud++;
    const trig = st.woTrigger[s.frequency] || 7, grace = st.woGrace[s.frequency] || 3;
    const id = 'AUD-' + String(nAud).padStart(6, '0');
    const wo = {
      id, no: fmt('AUD', d.slice(0, 4), nAud), scheduleId: s.id, zone: z.id, plant: z.plant, apu: z.apu, dept: z.dept,
      leader: z.leader, auditor: s.auditor, backupAuditor: s.backup, checksheetId: cs.id, csName: cs.name, csVersion: cs.version,
      auditType: s.auditType, plannedDate: d, plannedTime: s.time, dueDate: FS.addDays(d, grace), priority: s.priority,
      status: 'Assigned', createdAt: FS.addDays(d, -trig) + 'T06:00:00Z', createdBy: 'SYSTEM', responses: {}, score: null,
      approvals: (st.approvals[s.auditType] || []).map((level) => ({ level, status: 'Pending' })), locked: false, reopens: [],
      history: [{ at: FS.addDays(d, -trig) + 'T06:00:00Z', by: 'SYSTEM', status: 'Assigned', note: 'Auto-generated from ' + s.id }],
    };
    workorders.push(wo);
    const key = z.id + '|' + mk;
    const isFuture = d > today || (d === today);
    if (isFuture || notExecuted.includes(key)) {
      if (!isFuture && chance(0.5)) { wo.status = 'Accepted'; wo.acceptedAt = FS.addDays(d, -2) + 'T09:00:00Z'; }
      if (isFuture && chance(0.4)) { wo.status = 'Accepted'; wo.acceptedAt = FS.addDays(today, -1) + 'T11:20:00Z'; wo.history.push({ at: wo.acceptedAt, by: wo.auditor, status: 'Accepted' }); }
      return;
    }
    // execute
    const actualDate = FS.addDays(d, chance(0.75) ? 0 : between(1, 2)) > today ? d : FS.addDays(d, chance(0.75) ? 0 : between(1, 2));
    const p = prof[z.id]; const mi = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].indexOf(mk);
    const startH = Number(s.time.slice(0, 2)), startM = Number(s.time.slice(3));
    const dur = between(Math.round(z.duration * 0.7), Math.round(z.duration * 1.3));
    wo.startedAt = `${actualDate}T${String(startH - 5).padStart(2, '0')}:${String((startM + 30) % 60).padStart(2, '0')}:00Z`;
    const endMs = new Date(wo.startedAt).getTime() + dur * 60000;
    const partial = inProgress.includes(key);
    let qIndex = 0;
    cs.questions.forEach((q) => {
      qIndex++;
      if (partial && qIndex > 13) return;
      let mean = p.base + p.trend * mi + (p.sb[q.s] || 0) + ((p.drop || {})[mk] || 0);
      if (p.s5drop && q.s === 'S5') mean -= 0.25 * mi;
      if (s.auditType === 'Weekly Audit') mean += 0.15;
      let v = clamp(Math.round(mean + (R() - 0.5) * 2.3), 1, 5);
      const rf = repeatForce[z.id];
      if (rf && rf.qid === q.qid && rf.months.includes(mk) && s.auditType === 'Monthly Audit') v = 2;
      const fc = s.auditType === 'Monthly Audit' ? FORCE_CRIT[z.id + '|' + mk + '|' + q.qid] : null;
      if (fc) v = 1;
      const resp = { v, remark: '', photos: [], at: wo.startedAt };
      if (!q.mandatory && chance(0.25)) resp.v = 'NA';
      if (v >= 4 && chance(0.12)) resp.remark = pick(['Good condition', 'Standard followed', 'Improved since last audit', 'Labels in place']);
      wo.responses[q.qid] = resp;
      // findings
      let sev = null;
      if (resp.v !== 'NA' && v <= st.findingThreshold) sev = v === 1 ? (chance(0.3) ? 'Critical' : 'Major') : (chance(0.25) ? 'Major' : 'Minor');
      else if (resp.v !== 'NA' && v === 3 && chance(0.09)) sev = 'Observation';
      else if (resp.v !== 'NA' && v === 4 && chance(0.008)) sev = 'Improvement Opportunity';
      if (fc) sev = 'Critical';
      if (!sev) return;
      nF++;
      const fid = 'FND-' + String(nF).padStart(6, '0');
      const text = fc ? fc : rf && rf.qid === q.qid && rf.months.includes(mk) ? rf.text : pick(FIND_TXT[q.s]);
      const resp2 = chance(0.6) ? z.leader : pick(z.members);
      const photos = [];
      if (chance(0.55)) photos.push({ id: 'PH-' + photoSeed, thumb: illus(q.s, 'before', photoSeed++), inline: true, name: 'finding.svg', by: wo.auditor, at: wo.startedAt });
      resp.photos = photos.slice(); resp.findingId = fid;
      resp.remark = resp.remark || text;
      const cat = { S1: 'Unneeded items', S2: pick(['Identification / labelling', 'Storage & location', 'Floor marking']), S3: pick(['Cleanliness', 'Leaks & contamination']), S4: pick(['Visual standards', 'Documentation']), S5: 'Discipline / behaviour' }[q.s];
      const due = FS.addDays(actualDate, st.ncClosure[sev]);
      const f = {
        id: fid, no: fmt('FND', actualDate.slice(0, 4), nF), woId: id, woNo: wo.no, zone: z.id, plant: z.plant, apu: z.apu, dept: z.dept,
        s: q.s, qid: q.qid, question: q.text, desc: text, category: cat, severity: sev, score: v, responsible: resp2, due,
        immediate: pick(IMMEDIATE), rootCause: '', ca: '', pa: '', status: 'Open', photos, createdAt: wo.startedAt, createdBy: wo.auditor, auditDate: actualDate,
      };
      findings.push(f);
      if (partial) return;
      // actions
      const needAction = sev !== 'Observation' || chance(0.5);
      if (!needAction) { if (actualDate < '2026-08-01') f.status = 'Closed'; return; }
      const nActs = (sev === 'Critical' || (sev === 'Major' && chance(0.3))) ? 2 : 1;
      for (let k = 0; k < nActs; k++) {
        nA++;
        const aid = 'ACT-' + String(nA).padStart(6, '0');
        const target = k === 0 ? due : FS.addDays(due, 14);
        const created = FS.addDays(actualDate, between(0, 2));
        const a = {
          id: aid, no: fmt('ACT', created.slice(0, 4), nA), findingId: fid, findingNo: f.no, woId: id, zone: z.id, plant: z.plant, apu: z.apu, dept: z.dept,
          desc: k === 0 ? pick(CA) : pick(PA), type: k === 0 ? (sev === 'Improvement Opportunity' ? 'Improvement' : 'Corrective') : 'Preventive',
          responsible: k === 0 ? resp2 : z.leader, target, priority: sev === 'Critical' ? 'High' : sev === 'Major' ? 'High' : sev === 'Minor' ? 'Medium' : 'Low',
          status: 'Open', rootCause: pick(ROOT), ca: '', pa: '', evidence: [], createdAt: created + 'T10:00:00Z', createdBy: z.leader,
          history: [{ at: created + 'T10:00:00Z', by: z.leader, from: '', to: 'Open', note: 'Action assigned' }],
        };
        const age = FS.diffDays(today, created);
        const r = R();
        const markDone = (when, verifier, closed) => {
          a.status = 'In Progress'; a.history.push({ at: FS.addDays(created, 1) + 'T09:00:00Z', by: a.responsible, from: 'Open', to: 'In Progress' });
          a.ca = a.desc; a.pa = pick(PA); a.completedAt = when;
          a.evidence = [{ id: 'PH-' + photoSeed, thumb: illus(q.s, 'after', photoSeed++), inline: true, name: 'after.svg', by: a.responsible, at: when + 'T12:00:00Z' }];
          a.status = 'Submitted for Verification'; a.submittedAt = when + 'T12:00:00Z';
          a.history.push({ at: a.submittedAt, by: a.responsible, from: 'In Progress', to: 'Submitted for Verification', note: 'Evidence uploaded' });
          if (verifier) {
            const vd = FS.addDays(when, between(1, 3)) > today ? today : FS.addDays(when, between(1, 3));
            a.status = closed ? 'Closed' : 'Verified'; a.verifiedBy = verifier; a.verifiedAt = vd + 'T15:00:00Z'; a.verRemarks = pick(['Effective – verified on floor', 'Verified, sustained for 2 weeks', 'Accepted', 'Effective']);
            a.history.push({ at: a.verifiedAt, by: verifier, from: 'Submitted for Verification', to: 'Verified', note: a.verRemarks });
            if (closed) a.history.push({ at: a.verifiedAt, by: verifier, from: 'Verified', to: 'Closed' });
          }
        };
        const verifier = chance(0.7) ? z.leader : 'APS101' + ['CU', 'FB', 'PE', 'SC'].indexOf(z.apu);
        if (age > 45) {
          const when = FS.addDays(created, between(2, Math.max(3, FS.diffDays(target, created) + (chance(0.15) ? 6 : 0))));
          if (r < 0.06) { a.status = 'In Progress'; a.history.push({ at: FS.addDays(created, 2) + 'T09:00:00Z', by: a.responsible, from: 'Open', to: 'In Progress' }); }
          else markDone(when, verifier, true);
        } else if (age > 20) {
          const when = FS.addDays(created, between(2, 12));
          if (r < 0.55) markDone(when, verifier, chance(0.7));
          else if (r < 0.7) { markDone(when, null); }
          else if (r < 0.8) { markDone(when, null); a.status = 'Rejected'; a.rejectReason = 'Labels are temporary paper labels – use the standard laminated labels'; a.revisedTarget = FS.addDays(today, between(-4, 6)); a.history.push({ at: FS.addDays(when, 2) + 'T10:00:00Z', by: verifier, from: 'Submitted for Verification', to: 'Rejected', note: a.rejectReason }); }
          else if (r < 0.92) { a.status = 'In Progress'; a.history.push({ at: FS.addDays(created, 3) + 'T09:00:00Z', by: a.responsible, from: 'Open', to: 'In Progress' }); }
        } else {
          if (r < 0.2) markDone(FS.addDays(created, between(1, Math.max(1, age - 1))), null);
          else if (r < 0.5) { a.status = 'In Progress'; a.history.push({ at: FS.addDays(created, 1) + 'T09:00:00Z', by: a.responsible, from: 'Open', to: 'In Progress' }); }
          else if (r < 0.58 && age > 6) markDone(FS.addDays(created, 3), verifier, false);
        }
        actions.push(a);
      }
      f.rootCause = actions[actions.length - 1].rootCause;
      f.ca = actions.filter((x) => x.findingId === fid && x.type !== 'Preventive').map((x) => x.desc).join('; ');
      f.pa = actions.filter((x) => x.findingId === fid && x.type === 'Preventive').map((x) => x.desc).join('; ');
      f.status = FS.findingStatus(f, actions);
    });
    wo.endedAt = partial ? null : new Date(endMs).toISOString().replace('.000', '');
    wo.score = FS.scoreAudit(cs.questions, wo.responses, st);
    if (partial) { wo.status = 'In Progress'; wo.history.push({ at: wo.startedAt, by: wo.auditor, status: 'In Progress' }); return; }
    wo.duration = dur; wo.submittedAt = wo.endedAt; wo.locked = true;
    wo.history.push({ at: wo.startedAt, by: wo.auditor, status: 'In Progress' }, { at: wo.submittedAt, by: wo.auditor, status: 'Submitted' });
    const ageA = FS.diffDays(today, actualDate);
    const approver = (lvl) => lvl === 'Zone Leader' ? z.leader : lvl === '5S Facilitator' ? 'APS101' + ['CU', 'FB', 'PE', 'SC'].indexOf(z.apu) : 'APS1002';
    let pendingFrom = ageA <= 4 ? 0 : (ageA <= 9 ? 1 : 99);
    wo.approvals.forEach((ap, i) => {
      if (i < pendingFrom) { ap.status = 'Approved'; ap.by = approver(ap.level); ap.at = FS.addDays(actualDate, i + 1 > ageA ? 0 : i + 1) + 'T16:00:00Z'; ap.remark = pick(['Reviewed', 'Agreed with findings', 'OK', 'Approved – follow up S4 actions']); }
    });
    const allApproved = wo.approvals.every((a) => a.status === 'Approved');
    if (allApproved) {
      wo.status = ageA > 35 ? 'Closed' : 'Approved';
      wo.history.push({ at: wo.approvals.length ? wo.approvals[wo.approvals.length - 1].at : wo.submittedAt, by: wo.approvals.length ? wo.approvals[wo.approvals.length - 1].by : 'SYSTEM', status: 'Approved' });
      if (wo.status === 'Closed') wo.history.push({ at: FS.addDays(actualDate, 35) + 'T18:00:00Z', by: 'SYSTEM', status: 'Closed', note: 'Auto-closed after actions verified' });
    } else wo.status = wo.approvals.some((a) => a.status === 'Approved') ? 'Under Review' : 'Submitted';
    if (wo.status === 'Under Review') wo.history.push({ at: wo.approvals[0].at, by: wo.approvals[0].by, status: 'Under Review' });
  });

  // one reopened audit for traceability demo
  const reo = workorders.find((w) => w.zone === 'CU-W01' && w.plannedDate.startsWith('2026-07'));
  if (reo) { reo.reopens.push({ by: 'APS1010', at: '2026-07-24T11:00:00Z', reason: 'Auditor marked S3-04 wrongly; cleaning kit was present in alternate location', prevScore: reo.score.overall.pct }); reo.history.push({ at: '2026-07-24T11:00:00Z', by: 'APS1010', status: 'Reopened', note: 'Correction of S3-04' }, { at: '2026-07-24T15:30:00Z', by: reo.auditor, status: 'Submitted', note: 'Resubmitted after correction' }); }

  // improvements / kaizen
  const improvements = [];
  const kz = [
    ['CU-P01', 'S2', 'Shadow board for drawing-die tools', 'Tools kept loose in a drawer, 6–8 min search per changeover', 'Foam-cut shadow board at the line with tool outlines', 'Changeover tool search reduced to under 1 min', ['Time saving', 'Visual improvement'], 42000],
    ['CU-P03', 'S3', 'Drip tray and leak tag for annealer pump', 'Recurring oil spill around pump base', 'Fabricated drip tray and added leak-check to AM sheet', 'Floor dry for 6 weeks, no slip incidents', ['Safety improvement'], 8500],
    ['FB-W01', 'S2', 'FIFO flow rack for finished reels', 'Reels stacked on floor, FIFO lost', 'Gravity flow rack with lane labels', 'FIFO compliance 100%, 18 m² freed', ['Space saving', 'Quality improvement'], 120000],
    ['PE-P01', 'S1', 'Feeder cart red-tag clean-out', '14 unused feeder carts in SMT aisle', 'Red-tag event and return to supplier', 'Aisle width restored, 22 m² freed', ['Space saving'], 0],
    ['PE-P02', 'S3', 'Panel dust covers on screw-driving stations', 'Dust on control panels every shift', 'Hinged acrylic covers with cleaning schedule', 'Panel cleaning time halved', ['Productivity improvement'], 15000],
    ['SC-W01', 'S4', 'Chemical compatibility visual board', 'Operators unsure of segregation rules', 'Colour-coded compatibility board at entry', 'Zero segregation errors in 2 audits', ['Safety improvement', 'Visual improvement'], 6000],
    ['FB-P01', 'S5', 'Daily 5-minute 5S checklist at tower', 'No routine for 5S between audits', 'Laminated 5-minute checklist on the zone board', 'S5 score up from 68% to 84%', ['Quality improvement'], 0],
    ['CU-M01', 'S2', 'Spare-part kanban for workshop', 'Spares stored in mixed boxes', 'Two-bin kanban with min/max labels', 'Stock-outs reduced from 5 to 0 per month', ['Cost reduction', 'Time saving'], 64000],
    ['SC-P02', 'S1', 'Remove obsolete bonding fixtures', 'Obsolete fixtures occupying 2 rack levels', 'Scrapped after engineering sign-off', '2 rack levels freed for active fixtures', ['Space saving'], 0],
    ['PE-C01', 'S4', 'Canteen waste segregation standard', 'Mixed waste in canteen bins', 'Labelled bins and visual standard', 'Segregation compliance 95%', ['Visual improvement'], 3000],
  ];
  kz.forEach(([zone, s, title, before, idea, after, benefits, saving], i) => {
    const z = zones.find((x) => x.id === zone);
    const f = findings.find((x) => x.zone === zone && x.s === s);
    const date = FS.addDays('2026-05-10', i * 14);
    const statusList = ['Closed', 'Closed', 'Verified', 'Closed', 'Implemented', 'Verified', 'Closed', 'Implemented', 'In Progress', 'Closed'];
    improvements.push({
      id: 'IMP-' + String(i + 1).padStart(6, '0'), no: fmt('IMP', '2026', i + 1), zone, plant: z.plant, apu: z.apu, dept: z.dept, s, title,
      findingId: f ? f.id : '', before, idea, desc: idea, after, owner: z.leader, date, benefits, saving, status: statusList[i],
      beforePhoto: { id: 'KB-' + i, thumb: illus(s, 'before', 500 + i), inline: true }, afterPhoto: statusList[i] === 'In Progress' ? null : { id: 'KA-' + i, thumb: illus(s, 'after', 500 + i), inline: true },
      verifiedBy: ['Verified', 'Closed'].includes(statusList[i]) ? 'APS101' + ['CU', 'FB', 'PE', 'SC'].indexOf(z.apu) : '', createdAt: date + 'T10:00:00Z', createdBy: z.leader,
    });
  });

  // notifications (recent events)
  const recent = (iso) => iso >= FS.addDays(today, -10);
  workorders.filter((w) => recent(w.createdAt) && w.createdBy === 'SYSTEM').forEach((w) => notifications.push({ id: 'N-' + w.id, at: w.createdAt, type: 'Audit assigned', title: 'Audit assigned: ' + w.no, body: `Zone ${w.zone} planned ${w.plannedDate}`, to: [w.auditor], link: { page: 'wo', id: w.id }, readBy: [] }));
  workorders.filter((w) => w.submittedAt && recent(w.submittedAt)).forEach((w) => notifications.push({ id: 'N-S' + w.id, at: w.submittedAt, type: 'Audit completed', title: `Audit submitted: ${w.zone} scored ${w.score.overall.pct}%`, body: w.no, to: [w.leader, 'APS101' + ['CU', 'FB', 'PE', 'SC'].indexOf(w.apu)], link: { page: 'wo', id: w.id }, readBy: [] }));
  findings.filter((f) => f.severity === 'Critical' && recent(f.createdAt)).forEach((f) => notifications.push({ id: 'N-' + f.id, at: f.createdAt, type: 'Critical finding created', title: 'Critical finding in ' + f.zone, body: f.desc, to: [f.responsible, 'APS1002'], link: { page: 'finding', id: f.id }, readBy: [] }));
  actions.filter((a) => a.submittedAt && a.status === 'Submitted for Verification' && recent(a.submittedAt)).forEach((a) => notifications.push({ id: 'N-' + a.id, at: a.submittedAt, type: 'Action submitted', title: 'Action submitted for verification: ' + a.no, body: a.desc, to: [zones.find((z) => z.id === a.zone).leader], link: { page: 'action', id: a.id }, readBy: [] }));

  const logs = [{ id: 'L-seed', date: today, session: 'seed', entries: [
    { at: '2026-03-18T09:12:00Z', user: 'APS1001', module: 'Master', record: 'Plant PL2', action: 'Created', prev: '', next: 'Plant 2 – Hosur', device: 'Chrome / Windows' },
    { at: '2026-03-18T09:40:00Z', user: 'APS1001', module: 'Master', record: 'Zone SC-W01', action: 'Created', prev: '', next: 'Chemical Store', device: 'Chrome / Windows' },
    { at: '2026-03-19T10:05:00Z', user: 'APS1001', module: 'User Role', record: 'User APS1013', action: 'Role assigned', prev: 'auditor', next: 'facilitator', device: 'Chrome / Windows' },
    { at: '2026-03-20T10:00:00Z', user: 'APS1010', module: 'Audit Planner', record: 'SCH-0001', action: 'Schedule created', prev: '', next: 'Monthly, CU-P01', device: 'Edge / Windows' },
    { at: '2026-06-24T09:30:00Z', user: 'APS1001', module: 'Master', record: 'CS-PROD-V2', action: 'Checksheet version released', prev: 'V1.0', next: 'V2.0', device: 'Chrome / Windows' },
    { at: '2026-07-24T11:00:00Z', user: 'APS1010', module: 'Work Orders', record: reo ? reo.no : '', action: 'Audit reopened', prev: 'Approved', next: 'Reopened', device: 'Chrome / Android' },
    { at: '2026-09-24T16:10:00Z', user: 'APS1010', module: 'Audit Planner', record: 'SCH-0025', action: 'Schedule created', prev: '', next: 'Weekly, CU-P03', device: 'Chrome / Windows' },
    { at: '2026-09-26T12:15:00Z', user: 'APS1012', module: 'Actions', record: (actions.find((a) => a.zone === 'PE-P02') || {}).no || '', action: 'Action reassigned', prev: 'Operator', next: 'Zone Leader', device: 'Safari / iPad' },
  ] }];

  const counters = { AUD: nAud, FND: nF, ACT: nA, IMP: improvements.length };
  return { settings: st, masters: ms, counters, users, zones, checksheets: css, schedules, workorders, findings, actions, improvements, notifications, logs };
}

module.exports = { generate, settings, masters, checksheets, illus, hash };

if (require.main === module) {
  const d = generate(process.argv[2] || '2026-10-01');
  const fs = require('fs'); const path = require('path');
  const out = process.argv[3] || path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'dataset.json'), JSON.stringify(d));
  const summary = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.length : 'obj']));
  console.log(summary);
}
