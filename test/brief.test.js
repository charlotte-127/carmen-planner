// Run with: npm test
const assert = require('assert');
global.window = global;
const P = require('../renderer/planner.js');
window.Planner = P;
require('../renderer/demo.js');
const S = require('../renderer/syllabus.js');
const B = require('../renderer/brief.js');

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('  ok  ' + name);
};
const NOW = new Date(2026, 9, 9, 15, 30); // Fri Oct 9, 3:30 PM
const SET = { weekday: 4, weekend: 3, start: '19:00', rest: 'none', pace: 1 };
const at = (days, h = 23, m = 59) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const data = (assignments) => ({ courses: [{ id: 'm', code: 'MATH 1151' }, { id: 'c', code: 'CHEM 1210' }], assignments: assignments.map((a, i) => Object.assign({ id: String(i), courseId: 'm', points: 10 }, a)) });
const brief = (d, rules) => B.make(P.build(d, NOW, SET, new Set()), { now: NOW, settings: SET, rules });

test('sample courses: a full brief with every part', () => {
  const d = Demo.build(NOW);
  const rules = {};
  d.courses.forEach((c) => (rules[c.id] = S.summarize(Demo.courseContent(c.id).syllabus.blocks).dontMiss));
  const r = brief(d, rules);
  assert(r.headline.length > 20 && r.headline.length < 200, r.headline);
  assert(r.do_first.length >= 3 && r.do_first.length <= 4);
  assert.strictEqual(r.by_course.length, d.courses.length);
  assert(r.watch_out.length >= 1 && r.watch_out.length <= 4);
  assert(r.pep);
  assert(!/undefined|NaN|\*\*/.test(JSON.stringify(r)), 'no broken text');
});

test('empty week says so, and points at what is coming', () => {
  const r = brief(data([{ name: 'Midterm 2', dueAt: at(10, 19, 0), points: 100 }]));
  assert(/^Nothing is due this week/.test(r.headline), r.headline);
  assert(/Midterm 2/.test(r.headline));
});

test('overdue work comes first, with the late rule only if it applies', () => {
  const rules = { m: [{ kind: 'risk', text: 'Late **lab reports** lose 10% per day.', rule: 'late' }, { kind: 'risk', text: '**Late work is not accepted.**', rule: 'late' }] };
  const r = brief(data([{ name: 'Quiz 3', dueAt: at(-1) }, { name: 'HW 5', dueAt: at(2) }]), rules);
  assert.strictEqual(r.do_first[0].task, 'Quiz 3 (MATH 1151)');
  assert(/Late work is not accepted/.test(r.do_first[0].why) && !/lab reports/.test(r.do_first[0].why), r.do_first[0].why);
  assert(/past due/.test(r.headline));
});

test('due tonight is said plainly', () => {
  const r = brief(data([{ name: 'Pre-Lab 5', dueAt: at(0, 23, 0) }, { name: 'HW 6', dueAt: at(4) }]));
  assert.strictEqual(r.do_first[0].task, 'Pre-Lab 5 (MATH 1151)');
  assert(/^Due today at 11:00 PM/.test(r.do_first[0].why), r.do_first[0].why);
});

test('two exams a day apart are flagged', () => {
  const r = brief(data([{ name: 'Midterm 2', dueAt: at(5, 19, 0), points: 100 }, { name: 'Exam 2', courseId: 'c', dueAt: at(6, 10, 0), points: 100 }]));
  assert(r.watch_out.some((w) => /MATH 1151 Midterm 2 .* CHEM 1210 Exam 2 .* back to back/.test(w)), r.watch_out.join('\n'));
  assert(/heavy week/i.test(r.headline), r.headline);
});

test('too much work for the hours set is called out first', () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ name: `Project ${i + 1}`, dueAt: at(1 + (i % 3)), points: 100 }));
  const r = brief(data(many));
  assert(/More work than time/.test(r.headline), r.headline);
  assert(/doesn’t fit/.test(r.watch_out[0]));
});

test('course note uses a syllabus rule that matches this week’s work', () => {
  const rules = { m: [{ kind: 'less', text: 'Your **lowest quiz** is dropped.', rule: 'drop' }, { kind: 'risk', text: 'You must attend **every lab**.', rule: 'must' }] };
  const r = brief(data([{ name: 'Quiz 4', dueAt: at(3) }]), rules);
  assert.strictEqual(r.by_course[0].tip, 'Good to know: Your lowest quiz is dropped.');
});

test('the same week gives the same brief (no random changes on every click)', () => {
  const d = data([{ name: 'HW 1', dueAt: at(2) }]);
  assert.deepStrictEqual(brief(d), brief(d));
});

console.log(`\n${passed} brief tests passed`);
