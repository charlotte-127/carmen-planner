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

  /* ---------- sample course content: syllabus text and modules ---------- */
  // Syllabus mini-format: "# " heading, "- " bullet, "a | b" table row, anything else a paragraph.
  function blocks(text) {
    return text
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (l.startsWith('# ') ? { t: 'h', x: l.slice(2) } : l.startsWith('- ') ? { t: 'li', x: l.slice(2) } : { t: 'p', x: l }));
  }

  // Shared boilerplate (written for this demo), so the summary has something to leave out.
  const BOILERPLATE = `
# Academic Misconduct
Academic integrity is essential to maintaining an environment that fosters excellence in teaching, research and other educational activities. Suspected cases of academic misconduct are reported to the university committee that reviews them, and sanctions can include failing the course.
# Disability Services
If you need an accommodation based on the impact of a disability, please register with the disability services office and let your instructor know as early in the semester as possible so that arrangements can be made.
# Mental Health
College students can experience a range of issues that cause barriers to learning, such as stress, low mood and difficulty concentrating. Free and confidential counseling services are available to all students, and help is available 24 hours a day.
# Diversity Statement
This course values the diversity of all students and is committed to an environment that is welcoming and respectful of every background and point of view.
# Technology Requirements
You will need a computer with a reliable internet connection, a current web browser, and access to CarmenCanvas. For technical help, contact the IT service desk.
`;

  const P = (title, headings) => ({ type: 'Page', title, headings: headings || [] });
  const A = (title) => ({ type: 'Assignment', title });
  const Q = (title) => ({ type: 'Quiz', title });
  const F = (title) => ({ type: 'File', title });

  const content = {
    d1: {
      syllabus: `
# MATH 1151: Calculus I
# Instructor and TAs
Instructor: Dr. Elena Rivera Email: rivera.42@example.edu Office: Math Tower 412
Office hours: Mondays and Wednesdays 2:00 to 3:30 pm in Math Tower 412, or by appointment. I reply to email within 24 hours on weekdays.
Recitation TA: Jordan Park Email: park.311@example.edu Office hours: Thursdays 4-5 pm in the Math Learning Center, Cockins Hall 132. No appointment needed.
# Required Materials
You need a WebAssign access code for Calculus: Early Transcendentals. The access code includes the e-book, so you do not need to buy a printed textbook.
A TI-30XS calculator is allowed on exams. Graphing calculators are not allowed.
# Grading
- WebAssign homework: 10%
- Quizzes: 15%
- Midterm 1: 20%
- Midterm 2: 20%
- Final exam: 35%
Your lowest two WebAssign homework scores will be dropped at the end of the semester.
There are 12 quizzes in recitation and only your best 10 of 12 quiz scores count toward your grade.
# Exams
Midterm 1 is on Thursday, Sep 24 and Midterm 2 is on Thursday, Oct 29, both from 7:15 to 8:30 pm.
The final exam is cumulative. If your final exam percentage is higher than your lowest midterm, the final exam score will replace your lowest midterm score.
# Make-up Policy
There are no make-up quizzes. A missed quiz simply becomes one of your two dropped quizzes.
Make-up midterms are only given for documented emergencies, and you must contact me before the exam starts.
# Grading Scale
A 93-100, A- 90-92.9, B+ 87-89.9, B 83-86.9, B- 80-82.9, C+ 77-79.9, C 73-76.9
${BOILERPLATE}`,
      modules: [
        { name: 'Start Here', items: [P('Welcome to MATH 1151'), F('Syllabus.pdf')] },
        { name: 'Week 5: Derivatives', items: [P('3.1 The definition of the derivative', ['Limit definition', 'Slope of the tangent line', 'Differentiability']), P('3.2 Basic rules', ['Power rule', 'Constant multiple and sum rules']), A('WebAssign HW 3.1–3.2')] },
        { name: 'Week 6: Rules of Differentiation', items: [P('3.3 Product and quotient rules', ['Product rule', 'Quotient rule']), P('3.4 Derivatives of trig functions', ['Derivatives of sin and cos', 'Other trig functions']), Q('Quiz 4: Derivatives')] },
        { name: 'Week 7: The Chain Rule', items: [P('3.5 The chain rule', ['Composite functions', 'Outer and inner derivatives']), P('3.6 Implicit differentiation', ['Differentiate both sides', 'Tangent lines to curves']), F('Midterm 2 review sheet.pdf')] },
        { name: 'Week 8: Applications of Derivatives', items: [P('4.1 Related rates', ['Draw and label a picture', 'Differentiate with respect to time']), P('4.2 Linear approximation', ['Tangent line approximation', 'Differentials'])] },
      ],
    },
    d2: {
      syllabus: `
# CHEM 1210: General Chemistry I
# Course Grading
- Mastering Chemistry homework | 10%
- Reading quizzes | 5%
- Laboratory | 25%
- Exams (3) | 45%
- Final exam | 15%
Mastering Chemistry homework is due before each lecture. The two lowest Mastering Chemistry assignments will be dropped.
# Laboratory
You must complete all 10 labs to pass the course. Missing a lab without an approved excuse results in an automatic E for the course.
Pre-lab assignments are due before your lab section begins. You will not be allowed to start the lab without them.
# Late Work
Late lab reports lose 10% per day and are not accepted after 3 days.
# Exams
Exams 1, 2 and 3 are in the evening. The final exam is cumulative and is required for every student.
# Materials
You need a Mastering Chemistry access code, safety goggles and a lab coat. Goggles must be worn at all times in the lab.
# Contact
Instructor | Dr. Samuel Osei | osei.7@example.edu | Tue/Thu 10:00-11:00 am, Celeste Lab 210
Lab TA | Mia Torres | torres.88@example.edu | Fri 1-2pm on Zoom, by appointment only
For questions about your lab grade, email your lab TA first.
${BOILERPLATE}`,
      modules: [
        { name: 'Course Information', items: [P('How this course works')] },
        { name: 'Chapter 5: Thermochemistry', items: [P('Energy and heat', ['First law of thermodynamics', 'Heat and work', 'State functions']), P('Enthalpy and calorimetry', ['Enthalpy change', 'Coffee-cup calorimetry', 'Specific heat']), A('Mastering Ch. 5')] },
        { name: "Chapter 6: Hess's Law and Formation", items: [P("Hess's law", ['Adding reactions', 'Reversing reactions']), P('Standard enthalpy of formation', ['Formation reactions', 'Using a table of values'])] },
        { name: 'Chapter 7: Quantum Theory', items: [P('Light and energy', ['Wavelength and frequency', 'Photons']), P('The Bohr model', ['Energy levels', 'Emission spectra']), Q('Reading Quiz Ch. 7')] },
        { name: 'Lab 5: Titration', items: [P('Pre-lab: Titration', ['Molarity', 'Equivalence point', 'Indicators']), A('Lab Report 4')] },
      ],
    },
    d3: {
      syllabus: `
# ENGLISH 1110: First-Year English Composition
Instructor: Hannah Brooks (brooks.214@example.edu)
Office hours: Tuesdays 11 am to 12:30 pm in Denney Hall 515, and on Zoom by appointment.
# Assignments and Grading
- Essay 1: Rhetorical analysis | 20%
- Essay 2: Researched argument | 25%
- Essay 3: Remix | 25%
- Reading reflections | 15%
- Participation and peer review | 15%
There are 10 reading reflections this semester. You only need to complete 8 of the 10 reading reflections; any extra reflections count as extra credit.
Each essay has a draft and a final version. Drafts are graded complete or incomplete.
# Late Work
Every student gets two 48-hour no-questions-asked extensions for essays. Just email me before the deadline.
After you use both extensions, late essays lose one third of a letter grade per day.
# Attendance
This is a discussion class, so attendance matters. More than 4 unexcused absences will lower your final grade by one third of a letter for each extra absence.
# Required Texts
All readings are posted on Carmen. You do not need to buy a textbook.
${BOILERPLATE}`,
      modules: [
        { name: 'Start Here', items: [P('Course overview')] },
        { name: 'Unit 1: Rhetorical Analysis', items: [P('The rhetorical situation', ['Audience', 'Purpose', 'Context']), P('Ethos, pathos and logos', ['Credibility', 'Emotional appeals', 'Logical appeals']), A('Essay 1 Final')] },
        { name: 'Unit 2: Researched Argument', items: [P('Finding and evaluating sources', ['Library databases', 'Scholarly versus popular sources']), P('Building an argument', ['Claims and evidence', 'Counterarguments']), A('Essay 2 Draft')] },
        { name: 'Unit 3: Remix', items: [P('Changing genre and audience', ['Choosing a genre', 'Reflection memo'])] },
      ],
    },
    d4: {
      syllabus: `
# ENGR 1181: Fundamentals of Engineering
# Grade Breakdown
- MATLAB homework: 20%
- Lab participation: 15%
- Team design project: 35%
- Quizzes: 10%
- Final exam: 20%
Your lowest MATLAB homework score is dropped.
# Attendance
Labs are hands-on and attendance is required. Each unexcused lab absence lowers your final grade by 2%.
# Late Assignments
Late MATLAB homework is not accepted, because solutions are posted right after the deadline.
# Team Project
You will work in a team of four. Every team member must submit a peer evaluation, and your project grade can be adjusted based on it.
# Instructional Team
Instructor: Prof. David Nguyen Email: nguyen.55@example.edu Office hours: MW 9:30-10:30 am, Hitchcock Hall 308
GTA: Aisha Rahman Email: rahman.19@example.edu Office hours: Wednesdays 3-5 pm in Hitchcock Hall 224, drop in
# Software
Install MATLAB through the university software site before the second week of class.
${BOILERPLATE}`,
      modules: [
        { name: 'Welcome', items: [P('Meet your instructional team')] },
        { name: 'Week 5: MATLAB Arrays', items: [P('Vectors and matrices', ['Creating arrays', 'Indexing', 'Element-wise operations']), P('Plotting in MATLAB', ['plot and labels', 'Multiple lines']), A('MATLAB Homework 5')] },
        { name: 'Week 6: Conditionals and Loops', items: [P('If statements', ['Relational operators', 'if, elseif, else']), P('For and while loops', ['Loop counters', 'Ending a loop']), A('MATLAB Homework 6')] },
        { name: 'Week 7: Design Process', items: [P('The engineering design process', ['Define the problem', 'Brainstorm and choose', 'Test and improve']), A('Design Project: Design Brief')] },
      ],
    },
    d5: {
      syllabus: `
# PSYCH 1100: Introduction to Psychology
# Grading
- Exams (3 x 20%): 60%
- Chapter quizzes: 15%
- Discussion posts: 10%
- Research participation: 15%
There are 13 chapter quizzes and only the best 10 of 13 quiz scores count.
You need to write 8 of the 10 discussion posts. Posts are graded on effort.
# Research Participation
You must complete 5 research credits through SONA, or the alternative writing assignment, by the last day of classes. This is 15% of your grade and cannot be made up after the deadline.
# Exams
Exams are not cumulative. Each exam covers about four chapters.
Make-up exams are only allowed with documentation, and must be scheduled within one week.
# Contact
Instructor: Dr. Laura Chen Email: chen.1002@example.edu
Student hours: Mondays 1-2 pm in Psychology Building 035. Please sign up for a slot on the course page first.
Grader: Ethan Wolfe Email: wolfe.6@example.edu Office hours by appointment only.
Email the course account for questions about grades. Expect a reply within 2 business days.
${BOILERPLATE}`,
      modules: [
        { name: 'Getting Started', items: [P('Syllabus and schedule')] },
        { name: 'Chapter 5: Sensation and Perception', items: [P('Vision', ['Rods and cones', 'Color vision']), P('Hearing and other senses', ['Pitch and loudness', 'Touch and pain']), Q('Chapter 5 Quiz')] },
        { name: 'Chapter 6: Learning', items: [P('Classical conditioning', ['Pavlov', 'Extinction and spontaneous recovery']), P('Operant conditioning', ['Reinforcement', 'Punishment', 'Schedules of reinforcement'])] },
        { name: 'Chapter 7: Memory', items: [P('How memory works', ['Encoding', 'Storage', 'Retrieval']), P('Forgetting', ['Interference', 'Memory distortion']), A('Discussion Post: Memory')] },
      ],
    },
  };

  function courseContent(id) {
    const c = content[id];
    if (!c) return null;
    return {
      courseId: id,
      fetchedAt: new Date().toISOString(),
      syllabus: { blocks: blocks(c.syllabus), url: '' },
      syllabusFile: null,
      modules: c.modules,
    };
  }


  root.Demo = { build, courseContent };
})(window);
