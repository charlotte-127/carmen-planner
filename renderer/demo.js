/* Sample data so anyone can try the app without a Canvas account. Dates are relative to today. */
(function (root) {
  function at(offsetDays, h, m) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(h, m || 0, 0, 0);
    return d.toISOString();
  }

  function build() {
    const courses = [
      { id: 'd1', code: 'MATH 1151', name: 'Calculus I', term: 'Autumn', syllabus: 'Weekly WebAssign homework, four quizzes, two midterms and a cumulative final.' },
      { id: 'd2', code: 'CHEM 1210', name: 'General Chemistry I', term: 'Autumn', syllabus: 'Pre-lab due before each lab. Lab reports are worth 5% each. Three exams.' },
      { id: 'd3', code: 'ENGLISH 1110', name: 'First-Year English Composition', term: 'Autumn', syllabus: 'Two essays with drafts and peer review. Weekly reading reflections.' },
      { id: 'd4', code: 'ENGR 1181', name: 'Fundamentals of Engineering', term: 'Autumn', syllabus: 'MATLAB homework, team design project, lab check-ins.' },
      { id: 'd5', code: 'PSYCH 1100', name: 'Introduction to Psychology', term: 'Autumn', syllabus: 'Chapter quizzes, discussion posts, three exams, research participation credit.' },
    ];
    const A = (id, c, name, due, pts, extra) =>
      Object.assign({ id, courseId: c, name, dueAt: due, points: pts, submitted: false, group: '', url: '' }, extra || {});
    const assignments = [
      A('1', 'd1', 'WebAssign HW 3.4–3.6', at(1, 23, 59), 20),
      A('2', 'd1', 'Quiz 4: Derivatives', at(3, 23, 59), 30),
      A('3', 'd1', 'WebAssign HW 3.7', at(6, 23, 59), 20),
      A('4', 'd1', 'Midterm 2', at(9, 19, 0), 150),
      A('5', 'd1', 'Quiz 3', at(-2, 23, 59), 30, { submitted: true }),
      A('6', 'd2', 'Pre-Lab 5: Titration', at(0, 23, 0), 10),
      A('7', 'd2', 'Safety Quiz Makeup', at(-1, 23, 59), 5),
      A('8', 'd2', 'Mastering Chemistry Ch. 6', at(2, 23, 59), 40),
      A('9', 'd2', 'Reading Quiz Ch. 7', at(4, 9, 0), 10),
      A('10', 'd2', 'Lab Report 4', at(5, 23, 59), 50),
      A('11', 'd2', 'Exam 1', at(13, 18, 0), 100),
      A('12', 'd3', 'Discussion: Rhetorical Analysis', at(1, 23, 59), 10),
      A('13', 'd3', 'Reading Reflection 5', at(3, 23, 59), 15),
      A('14', 'd3', 'Essay 2 Draft', at(7, 23, 59), 100),
      A('15', 'd3', 'Peer Review Response', at(9, 23, 59), 25),
      A('16', 'd3', 'Essay 1 Final', at(-5, 23, 59), 100, { submitted: true }),
      A('17', 'd4', 'Lab Check-in 7', at(2, 12, 0), 5),
      A('18', 'd4', 'MATLAB Homework 6', at(4, 23, 59), 30),
      A('19', 'd4', 'Design Project: Design Brief', at(11, 23, 59), 100),
      A('20', 'd4', 'Team Contract', at(-6, 23, 59), 10, { submitted: true }),
      A('21', 'd5', 'Chapter 5 Quiz', at(2, 23, 59), 25),
      A('22', 'd5', 'Discussion Post: Memory', at(4, 23, 59), 10),
      A('23', 'd5', 'Exam 2', at(8, 11, 0), 100),
      A('24', 'd5', 'Research Participation (SONA)', at(12, 23, 59), 20),
      A('25', 'd5', 'Syllabus Survey', at(-8, 23, 59), 5, { submitted: true }),
      A('26', 'd3', 'Essay 3 Proposal', null, 20),
      A('27', 'd1', 'Final Exam', at(40, 10, 0), 200),
    ];
    return { base: '', syncedAt: new Date().toISOString(), courses, assignments };
  }

  // A pre-written example of the AI brief, so demo mode shows the whole feature without a key.
  const ai = {
    headline: 'A front-loaded week: two exams and an essay draft land close together, so the next three evenings decide how calm the weekend feels.',
    do_first: [
      { task: 'Pre-Lab 5: Titration', why: 'Due tonight and needed for tomorrow’s lab, so it cannot slide.' },
      { task: 'Safety Quiz Makeup', why: 'Already late, and it takes ten minutes to clear.' },
      { task: 'Exam 2', why: 'PSYCH Exam 2 is about a week out. A practice set today shows which chapters need the most time.' },
    ],
    by_course: [
      { course: 'MATH 1151', note: 'Do HW 3.4–3.6 before Quiz 4. The derivative rules show up in both, and Midterm 2 builds on them.' },
      { course: 'CHEM 1210', note: 'Finish the titration pre-lab first, then write the Lab Report 4 results section while the lab is fresh.' },
      { course: 'ENGLISH 1110', note: 'Outline Essay 2 this week even though the draft is a week out. An outline makes the writing session much shorter.' },
    ],
    watch_out: [
      'PSYCH Exam 2 and MATH Midterm 2 are one day apart. Split your review so neither gets squeezed.',
      'Your heaviest evenings are mid-week. Getting a little ahead on the weekend keeps them manageable.',
    ],
    pep: 'You do not need a perfect week, just a steady one. Small sessions starting today beat one huge session on Sunday.',
  };

  root.Demo = { build, ai };
})(window);
