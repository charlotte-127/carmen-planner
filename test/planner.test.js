// Run with: npm test
const assert = require('assert');
const P = require('../renderer/planner.js');

const now = new Date(2026, 9, 7, 10, 0); // Wednesday, Oct 7 2026, 10:00
const at = (days, h = 23, m = 59) => {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const data = {
  courses: [
    { id: 'm', code: 'MATH 1151' },
    { id: 'c', code: 'CHEM 1210' },
  ],
  assignments: [
    { id: '1', courseId: 'm', name: 'HW 3.4', dueAt: at(1), points: 20 },
    { id: '2', courseId: 'm', name: 'Midterm 2', dueAt: at(9, 19, 0), points: 150 },
    { id: '3', courseId: 'c', name: 'Pre-Lab 5', dueAt: at(0, 23, 0), points: 10 },
    { id: '4', courseId: 'c', name: 'Exam 3', dueAt: at(20), points: 100 },
    { id: '5', courseId: 'c', name: 'Old quiz', dueAt: at(-20), points: 10 },
    { id: '6', courseId: 'm', name: 'Done HW', dueAt: at(2), points: 20, submitted: true },
    { id: '7', courseId: 'm', name: 'No date yet', dueAt: null, points: 20 },
    { id: '8', courseId: 'c', name: 'Late lab', dueAt: at(-1), points: 10 },
  ],
};

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('  ok  ' + name);
};

const plan = P.build(data, now, { weekday: 3, weekend: 2, rest: 'none', start: '19:00' }, new Set());

test('classifies work types', () => {
  assert.strictEqual(P.classify({ name: 'Midterm 2' }).kind, 'exam');
  assert.strictEqual(P.classify({ name: 'Quiz 4: Derivatives' }).kind, 'quiz');
  assert.strictEqual(P.classify({ name: 'Essay 2 Draft' }).kind, 'project');
  assert.strictEqual(P.classify({ name: 'Pre-Lab 5' }).kind, 'lab');
  assert.strictEqual(P.classify({ name: 'Research Participation (SONA)' }).kind, 'light');
  assert.strictEqual(P.classify({ name: 'Personal reflection' }).kind, 'discussion');
});

test('skips submitted, very old, and counts undated work', () => {
  const names = plan.tasks.map((t) => t.name);
  assert(!names.includes('Done HW'));
  assert(!names.includes('Old quiz'));
  assert(names.includes('Late lab'));
  assert.strictEqual(plan.undated, 1);
});

test('marks urgency correctly', () => {
  const by = Object.fromEntries(plan.tasks.map((t) => [t.name, t.urgency]));
  assert.strictEqual(by['Pre-Lab 5'], 'today');
  assert.strictEqual(by['HW 3.4'], 'soon');
  assert.strictEqual(by['Late lab'], 'overdue');
  assert.strictEqual(by['Exam 3'], 'later');
});

test('heads-up only covers the next 14 days', () => {
  const names = plan.ahead.map((a) => a.task.name);
  assert(names.includes('Midterm 2'));
  assert(!names.includes('Exam 3')); // 20 days away
  assert.strictEqual(P.HEADS_UP_DAYS, 14);
});

test('heads-up gives a start date before the due date', () => {
  const mid = plan.ahead.find((a) => a.task.name === 'Midterm 2');
  assert(mid.startBy, 'should have a start date');
  assert(new Date(mid.startBy + 'T00:00') < new Date(at(9)));
});

test('never schedules more than daily capacity', () => {
  Object.entries(plan.sessions).forEach(([k, list]) => {
    const total = list.reduce((s, x) => s + x.hours, 0);
    const d = new Date(k + 'T12:00');
    const cap = d.getDay() === 0 || d.getDay() === 6 ? 2 : 3;
    assert(total <= cap + 1e-9, `${k} has ${total} h`);
  });
});

test('work is scheduled no later than it is due, exams the day before', () => {
  Object.entries(plan.sessions).forEach(([k, list]) => {
    list.forEach((x) => {
      assert(k <= P.dkey(x.task.due) || x.task.diff < 0, `${x.task.name} on ${k}`);
      if (x.task.kind === 'exam') assert(k < P.dkey(x.task.due), `exam ${x.task.name} studied on its day`);
    });
  });
});

test('all hours are either scheduled or reported', () => {
  plan.tasks.forEach((t) => {
    let got = 0;
    Object.values(plan.sessions).forEach((l) => l.forEach((x) => x.task.key === t.key && (got += x.hours)));
    const missing = plan.unscheduled.filter((u) => u.task.key === t.key).reduce((s, u) => s + u.hours, 0);
    assert(Math.abs(got + missing - t.hours) < 1e-9, t.name);
  });
});

test('rest day gets no sessions', () => {
  const p2 = P.build(data, now, { weekday: 3, weekend: 2, rest: 'sat', start: '19:00' }, new Set());
  Object.keys(p2.sessions).forEach((k) => assert.notStrictEqual(new Date(k + 'T12:00').getDay(), 6));
});

test('checked-off tasks are removed from the schedule', () => {
  const key = plan.tasks.find((t) => t.name === 'Midterm 2').key;
  const p3 = P.build(data, now, {}, new Set([key]));
  Object.values(p3.sessions).forEach((l) => l.forEach((x) => assert.notStrictEqual(x.task.key, key)));
  assert(!p3.ahead.some((a) => a.task.key === key));
});

test('sessions stay inside the day', () => {
  Object.values(plan.sessions).forEach((l) =>
    l.forEach((x) => {
      assert(x.start >= 8 * 60);
      assert(x.end <= 24 * 60);
    })
  );
});

console.log(`\n${passed} tests passed`);
