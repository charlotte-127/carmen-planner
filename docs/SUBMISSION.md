# Contest post draft (Prompted, "Build what you want")

Copy these into your Build post. Replace the parts in [brackets], and change anything that isn't true for you. The story should be yours.

---

## Title

Carmen Planner: your Canvas, turned into a plan for the week

## Link to build

https://charlotte-127.github.io/carmen-planner/

## Caption

Every Sunday I opened Carmen, clicked through five courses, and tried to figure out what was due and when I should start studying for exams. So I built a desktop app that does it for me.

**What it does.** You sign in to Carmen inside the app, the normal Ohio State way with Duo. Carmen Planner reads all your courses, however many you take, and gives you:

1. **Due this week**, grouped by day, with overdue work on top and checkboxes.
2. **A study plan** that spreads the work across your evenings, using the hours you say you have. It works like Apple Calendar: drag blocks, stretch them, add notes, or add your own events.
3. **Next 2 weeks**: every exam and big assignment coming up, and the day you should start preparing.
4. **A syllabus summary for every course.** Most of us never read the whole syllabus, so we miss rules like "your best 10 of 12 quizzes count" or "you must complete every lab to pass". The app reads the syllabus (even PDF and Word files), skips the boilerplate, and puts those rules at the top, highlighted.
5. **Contact and office hours for every course**: each instructor's and TA's email, the days, times and place of their office hours, and whether you need an appointment.
6. **Themes**, including two cute ones, or your own picture as the background.
7. **A weekly brief**, written by the app from your plan: what kind of week it is, what to do first and why, where it gets tight (like two exams back to back), a line for each course, and the syllabus rule that matters this week.

Everything is free and runs on your computer. No account, no AI service, no cost.

**Privacy.** The app never sees your password, only reads your data, and keeps everything on your computer.

**Try it.** Download it from the link above. Works on Mac (Apple silicon and Intel) and Windows. Don't have Carmen open? Click "Try it with sample courses".

**AI tools:** Claude (Anthropic) for planning the app, writing all of the code, and testing it. The app itself runs without any AI service, so it's free for every student.

**Process.** [Say how much coding you knew before.] I started by describing my problem in Chinese to Claude. My first idea was a website, but a website can't sign in to Canvas for you, so we switched to a desktop app with its own sign-in window. I asked for Mac only at first, then realized [lots of students use Windows and older Intel Macs], so we added both. Claude wrote the code, then took screenshots of the app and fixed what looked wrong. The biggest lesson: the first study plan crammed all exam prep into the night before, because small homework filled up the early days. We changed the planner to reserve time for exams and projects first and spread it out, and suddenly the plan looked like something a real student would follow.

**Lessons learned.**
- Be specific about what you want. "Warn me 2 weeks ahead and tell me which day to start" worked much better than "add reminders".
- Ask the AI to test its own work. Seeing screenshots caught problems I would have missed.
- Start with sample data so people can try your project without signing in.
- Say when something is bad, and why. My first syllabus summary copied calendar rows and repeated the same rule three times. Telling Claude exactly what a student actually needs is what fixed it.
- Cut what doesn't work. I also tried a mind map of lecture notes built automatically from the slides, but it wasn't good enough, so I removed it and kept the app focused.
- Keep it free and simple. We tried a paid AI, then free ChatGPT by copy and paste, then free Gemini with a key. None was easy enough for students, so the weekly brief is now written by the app itself from the plan. Simpler won.

## Prompts I used

These are real messages I sent to Claude (originally in Chinese, translated):

> I want to make something that reads all of my course content on Canvas and sums it up into weekly study tasks and a weekly study plan.

> I want an app, ideally software you just download from a website. I don't want it on the App Store. It should work like a crawler, and students should be able to sign in to their own Canvas by hand when they use it.

> My computer has Apple silicon, but when it's done I want people without Apple silicon to be able to use it too, and make a Windows version as well.

> Early warning: exams and big assignments in the next 2 weeks, and tell me which day to start preparing.

> Add a summary of each course's syllabus to the app. Remove the useless parts and show the key points in bold or highlighted. For example, if a course doesn't require every assignment and only a certain number are enough, that MUST be pointed out to the user, because most people never actually read every syllabus.

> The study plan blocks should be movable, and I should be able to change their time and length, and click an empty spot to add an event or a note, like Apple Calendar.

> For the weekly brief, don't build in the paid Claude version. I want the free ChatGPT.

> I want free AI built into the app. Tell me which model I can use: ChatGPT or Gemini?

> Gemini didn't work out. No built-in AI; just make the weekly brief inside the app.

Original Chinese:

> ok我现在要做一个通过识别canvas上的所有关于学习课程的内容总结出每周的学习任务和学习计划

> 我要做app，最好是只从网站下载的软件，我不想上架app store。其次我要的是一个类似爬虫的软件，我要的是，学生使用的时候可以自己手动登陆自己的canvas

> 提前预警：未来 2周内的考试和大作业，提示该从哪天开始准备

> 我需要在app里加入总结每门课的syllabus，去除掉一些没有用的信息，并把重点内容用加粗或者highlight的形式展现出来，比如说一门课根本不需要完成所有的作业，只需要完成定量的作业就够了这种话语必须重点提醒用户！！因为很多人不会真的读完每个syllabus。

> 学习计划的色块要能移动，时间和时长可以改，点空白的地方可以加事件或备注，像苹果日历一样

> 还有这个weekly brief，不要嵌入Claude这个不免费的版本了，我要的是chatgpt免费版

> 我要的是免费的嵌入式AI，你告诉我能用哪个大模型，chatgpt？还是gemini？

> gemini不行，能不能不要嵌入式AI了，不好用，你就直接在这个app里做出来一个weekly brief

## Photos and video

Attach a screenshot of the website, plus `docs/welcome.png`, `docs/screenshot-light.png`, `docs/screenshot-plan.png` and `docs/screenshot-syllabus.png`.
A 30 to 60 second screen recording works best: open the app, click "Try it with sample courses", check off a task, and scroll to the study plan.
