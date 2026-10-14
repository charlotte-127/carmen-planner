// Run with: npm test
const assert = require('assert');
const C = require('../renderer/contacts.js');

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log('  ok  ' + name);
};
const B = (lines) => lines.map((l) => (l.startsWith('# ') ? { t: 'h', x: l.slice(2) } : l.startsWith('- ') ? { t: 'li', x: l.slice(2) } : { t: 'p', x: l }));
const short = (p) => [p.role, p.name, p.email, p.hours.map((h) => `${C.daysText(h.days)} ${h.time}${h.place ? ' @ ' + h.place : ''}`).join('; '), p.booking];

test('labels run together on one line (how PDFs come out)', () => {
  const r = C.parse(B(['Instructor: Dr. Jane Smith Email: smith.123@osu.edu Office: Math Tower 410 Office Hours: MW 2:00-3:00 PM, or by appointment', 'Teaching Assistant: Alex Kim Email: kim.2045@osu.edu Office Hours: Tu/Th 10:30–11:30 am in Cockins Hall 132 (no appointment needed)']));
  assert.deepStrictEqual(r.map(short), [
    ['Instructor', 'Dr. Jane Smith', 'smith.123@osu.edu', 'Mon & Wed 2 PM – 3 PM', 'also'],
    ['TA', 'Alex Kim', 'kim.2045@osu.edu', 'Tue & Thu 10:30 AM – 11:30 AM @ Cockins Hall 132', 'none'],
  ]);
  assert.strictEqual(r[0].office, 'Math Tower 410');
});

test('a heading, then name and email on their own lines, then a list of TAs', () => {
  const r = C.parse(B(['# Course Instructor', 'Professor Maria Lopez', 'lopez.88@osu.edu', 'Office hours: Tuesdays and Thursdays 1–2:30pm on Zoom. Please book a slot on Calendly.', 'I generally respond within 24 hours on university instructional days.', '# Teaching Assistants', '- Ben Carter – carter.501@osu.edu – Wednesdays 4-5 pm, Smith Lab 1005', '- Priya Shah – shah.77@osu.edu – Fri 11am-12pm (Zoom)']));
  assert.deepStrictEqual(r.map(short), [
    ['Instructor', 'Professor Maria Lopez', 'lopez.88@osu.edu', 'Tue & Thu 1 PM – 2:30 PM @ Zoom / online', 'required'],
    ['TA', 'Ben Carter', 'carter.501@osu.edu', 'Wed 4 PM – 5 PM @ Smith Lab 1005', 'unknown'],
    ['TA', 'Priya Shah', 'shah.77@osu.edu', 'Fri 11 AM – noon @ Zoom / online', 'unknown'],
  ]);
  assert.strictEqual(r[0].reply, 'within 24 hours on university instructional days');
});

test('a table of the teaching team', () => {
  const r = C.parse(B(['Role | Name | Email | Office hours', 'Instructor | Dr. Wei Chen | chen.9@osu.edu | Mon 3-4pm, Fri 10-11am, Caldwell Lab 220', 'GTA | Sam Ortiz | ortiz.12@osu.edu | By appointment only']));
  assert.deepStrictEqual(r.map(short), [
    ['Instructor', 'Dr. Wei Chen', 'chen.9@osu.edu', 'Mon 3 PM – 4 PM; Fri 10 AM – 11 AM @ Caldwell Lab 220', 'unknown'],
    ['TA', 'Sam Ortiz', 'ortiz.12@osu.edu', '', 'only'],
  ]);
});

test('vague contact text plus Carmen’s People list', () => {
  const r = C.parse(B(['# Contact and office hours', 'If calling or texting, please include your name so I know who is contacting me.', 'Email is usually the best way to reach me, and I generally respond within 24 hours on university instructional days.']), [
    { name: 'Jennifer Adams', role: 'teacher', email: '' },
    { name: 'Tom Lee', role: 'ta', email: 'lee.3@osu.edu' },
  ]);
  assert.deepStrictEqual(r.map((p) => [p.role, p.name, p.email, p.hours.length]), [['Instructor', 'Jennifer Adams', '', 0], ['TA', 'Tom Lee', 'lee.3@osu.edu', 0]]);
  assert(r[1].fromCarmen);
});

test('Carmen gives the full name of "Dr. Rivera" without adding a second person', () => {
  const r = C.parse(B(['Instructor: Dr. Rivera. Office hours: Mondays and Wednesdays 2:00 to 3:30 pm in Math Tower 412, or by appointment.']), [{ name: 'Elena Rivera', role: 'teacher', email: '' }]);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].name, 'Elena Rivera');
  assert.strictEqual(r[0].hours[0].place, 'Math Tower 412');
});

test('day and time formats', () => {
  const t = (s) => C.slotsOf(s).map((h) => `${C.daysText(h.days.map((d) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]))} ${C.fmt(h.start)}-${C.fmt(h.end)}`);
  assert.deepStrictEqual(t('MWF 9-10'), ['Mon, Wed & Fri 9 AM-10 AM']);
  assert.deepStrictEqual(t('TR 12:45–2:05 p.m.'), ['Tue & Thu 12:45 PM-2:05 PM']);
  assert.deepStrictEqual(t('Monday 11-12, Thursday 2-3'), ['Mon 11 AM-noon', 'Thu 2 PM-3 PM']);
  assert.deepStrictEqual(t('Mon–Thu 9–10 a.m.'), ['Mon – Thu 9 AM-10 AM']);
  assert.deepStrictEqual(t('11:30am to 1pm on Fridays'), ['Fri 11:30 AM-1 PM']);
  assert.deepStrictEqual(t('Exams are worth 10-20 points; read pages 5-7.'), []);
});

test('appointment wording', () => {
  assert.strictEqual(C.bookingOf('by appointment only', false), 'only');
  assert.strictEqual(C.bookingOf('MW 2-3pm or by appointment', true), 'also');
  assert.strictEqual(C.bookingOf('Mondays 1-2 pm. Please sign up for a slot on the course page first.', true), 'required');
  assert.strictEqual(C.bookingOf('Wed 3-5pm, drop in', true), 'none');
  assert.strictEqual(C.bookingOf('Wed 3-5pm', true), 'unknown');
});

test('instructions that only mention "your instructor" make no person', () => {
  assert.deepStrictEqual(C.parse(B(['# Late work', 'Contact your instructor before the deadline if you need an extension.', 'Late work loses 10% per day.'])), []);
});

test('MATH 1151 layout: role lines as headings, details below each', () => {
  for (const asHeading of [true, false]) {
    const t = asHeading ? 'h' : 'p';
    const r = C.parse([
      { t: 'h', x: 'Contact Information' },
      { t, x: 'Lecturer: Julian Alonso Mejia Cordero (Dr. Mejia)' },
      { t: 'p', x: 'Email Address: mejiacordero.2@osu.edu' },
      { t: 'p', x: 'Office: CH (Cockins Hall) 148 E' },
      { t: 'p', x: 'Office Hours: M,W,F 1:30 -2:30pm' },
      { t, x: 'TA: Summer Ireland' },
      { t: 'p', x: 'Email Address: ireland.118@osu.edu' },
      { t: 'p', x: 'Office: MA (Math Building, not Math Tower) 458' },
      { t: 'p', x: 'Office Hours: Thursdays from 12:45 to 2:45 PM' },
      { t, x: 'TA: Junjie Ni' },
      { t: 'p', x: 'Email Address: ni.509@osu.edu' },
      { t: 'p', x: 'Office: MW(Math Tower, not Math Building) 330' },
      { t: 'p', x: 'Office Hours: Tuesday & Thursday 10:30 to 11:30 AM (No office hours on Thursday, September 3)' },
    ]);
    assert.deepStrictEqual(r.map(short), [
      ['Instructor', 'Julian Alonso Mejia Cordero', 'mejiacordero.2@osu.edu', 'Mon, Wed & Fri 1:30 PM – 2:30 PM', 'unknown'],
      ['TA', 'Summer Ireland', 'ireland.118@osu.edu', 'Thu 12:45 PM – 2:45 PM', 'unknown'],
      ['TA', 'Junjie Ni', 'ni.509@osu.edu', 'Tue & Thu 10:30 AM – 11:30 AM', 'unknown'],
    ], asHeading ? 'as headings' : 'as paragraphs');
    assert.strictEqual(r[0].office, 'CH (Cockins Hall) 148 E');
  }
});

console.log(`\n${passed} contact tests passed`);
