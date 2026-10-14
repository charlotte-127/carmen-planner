// Run with: npm test
const assert = require('assert');
global.window = global;
require('../renderer/demo.js');
const S = require('../renderer/syllabus.js');

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('  ok  ' + name);
};
const B = (lines) => lines.map((l) => (l.startsWith('# ') ? { t: 'h', x: l.slice(2) } : l.startsWith('- ') ? { t: 'li', x: l.slice(2) } : { t: 'p', x: l }));

test('finds "you don\'t have to do everything" rules', () => {
  const r = S.summarize(B(['# Grading', 'Only your best 10 of 12 quizzes count.', 'Your two lowest homework scores will be dropped.', 'You only need to complete 8 of the 10 reflections.']));
  assert.strictEqual(r.dontMiss.length, 3);
  assert(r.dontMiss.every((d) => d.kind === 'less'));
  assert(r.dontMiss.every((d) => /\*\*.+\*\*/.test(d.text)), 'every rule has a highlight');
});

test('finds risky rules and puts them after the good news', () => {
  const r = S.summarize(B(['# Policies', 'You must complete all labs to pass the course.', 'Late work is not accepted.', 'The lowest quiz is dropped.']));
  assert.deepStrictEqual(r.dontMiss.map((d) => d.kind), ['less', 'risk', 'risk']);
});

test('highlights whole words only', () => {
  const r = S.summarize(B(['Make-up midterms are only given for documented emergencies, and you must email me.']));
  r.dontMiss.forEach((d) => {
    const m = /\*\*(.+?)\*\*/.exec(d.text);
    assert(m && !/^\w*[a-z]\*\*/.test(d.text.slice(m.index + m[0].length - 1)), d.text);
    assert(!/\*\*[a-z]/.test(d.text.slice(m.index + m[0].length)), d.text);
  });
});

test('leaves out university boilerplate and says so', () => {
  const r = S.summarize(B(['# Academic Misconduct', 'You must not plagiarize or you will fail the course.', '# Disability Services', 'Register with the office.', '# Grading', '- Homework: 40%', '- Exams: 60%']));
  assert.deepStrictEqual(r.skipped, ['Academic Misconduct', 'Disability Services']);
  assert(!r.dontMiss.some((d) => /plagiar/i.test(d.text)));
});

test('reads grade breakdowns in different formats', () => {
  const r = S.summarize(B(['# Grading', 'Homework | 20%', 'Quizzes ........ 10%', '- Exams (3 x 20%): 60%', 'Participation (10%)', 'A 93-100', 'Late work loses 10% per day.']));
  assert.deepStrictEqual(r.grading.map((g) => [g.item, g.value]), [['Homework', 20], ['Quizzes', 10], ['Exams (3 x 20%)', 60], ['Participation', 10]]);
  assert.strictEqual(r.gradingTotal, 100);
});

test('works on every sample syllabus', () => {
  ['d1', 'd2', 'd3', 'd4', 'd5'].forEach((id) => {
    const r = S.summarize(window.Demo.courseContent(id).syllabus.blocks);
    assert(r.dontMiss.length >= 3, id);
    assert.strictEqual(r.gradingTotal, 100, id);
    assert(r.skipped.length >= 4, id);
  });
});

test('ignores calendar and table rows (like a daily class calendar)', () => {
  const r = S.summarize(B(['# Calendar', '9 Approximating the Area Under a Curve (ATAUAC) HW: O | 10 Worksheet: A, ATAUAC | 11 Veterans Day No Classes', '9Approximating the Area Under a Curve (ATAUAC)HW: O', '12 Applied Related Rates (ARR) HW: DOIF | 13 Worksheet: Related Rates Comp Test']));
  assert.strictEqual(r.dontMiss.length, 0);
  assert.strictEqual(r.sections.length, 0);
});

test('"area under a curve" is not a grading curve', () => {
  const r = S.summarize(B(['We study the area under a curve using Riemann sums and definite integrals.']));
  assert.strictEqual(r.dontMiss.length, 0);
});

test('a rule repeated in the schedule, the FAQ and the policy section shows once', () => {
  const r = S.summarize(B([
    '# Exams', 'Take all four exams and have your lowest exam score dropped.',
    'The final exam is optional IF you have already taken the first 3 exams AND', '- you are happy with your exam average',
    'Makeup exams are given only for excused absences and are administered in person.',
    '# Schedule', '15 (Tues.) Exam 4 / Final Exam – Carmen (Optional)', '15 (Tues.) Exam 4 / Final Exam Optional Final Exam on Carmen', 'Optional — not required for this course.',
    '# FAQ', 'Makeup exams are given only for excused absences and will be administered in person.', 'Makeup exams are provided only for excused absences and will be administered in person.',
  ]));
  const texts = r.dontMiss.map((d) => d.text.replace(/\*\*/g, ''));
  assert.strictEqual(texts.filter((t) => /makeup/i.test(t)).length, 1, texts.join('\n'));
  assert.strictEqual(texts.filter((t) => /optional/i.test(t)).length, 1, texts.join('\n'));
  assert(texts.some((t) => /first 3 exams AND you are happy with your exam average/.test(t)), 'the broken sentence is joined with its bullet');
  assert(!texts.some((t) => /^15 \(Tues/.test(t)), 'schedule rows are not rules');
  assert.strictEqual(r.dontMiss.find((d) => /makeup/i.test(d.text)).repeats, 3);
});

test('a short rule right after another rule stays its own rule', () => {
  const r = S.summarize([{ t: 'p', x: 'Your lowest homework score is dropped. Late work is not accepted.' }]);
  assert.deepStrictEqual(r.dontMiss.map((d) => d.kind).sort(), ['less', 'risk']);
});

console.log(`\n${passed} syllabus tests passed`);
