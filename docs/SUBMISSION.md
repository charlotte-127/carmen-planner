# Contest post draft (Prompted, "Build what you want")

Copy these into your Build post. Replace the parts in [brackets], and change anything that isn't true for you. The story should be yours.

---

## Title

Carmen Planner: your Canvas, turned into a plan for the week

## Link to build

[Your website, for example https://YOUR-USERNAME.github.io/carmen-planner/]

## Caption

Every Sunday I opened Carmen, clicked through five courses, and tried to figure out what was due and when I should start studying for exams. So I built a desktop app that does it for me.

**What it does.** You sign in to Carmen inside the app, the normal Ohio State way with Duo. Carmen Planner reads your courses and due dates and gives you three things:

1. **Due this week**, grouped by day, with overdue work on top and checkboxes.
2. **A study plan** that spreads the work across your evenings, using the hours you say you have.
3. **Next 2 weeks**: every exam and big assignment coming up, and the day you should start preparing.

If you add your own Claude API key, Claude also writes a short weekly brief: what to do first, a note for each course, and crunch points to watch for.

**Privacy.** The app never sees your password, only reads your data, and keeps everything on your computer.

**Try it.** Download it from the link above. Works on Mac (Apple silicon and Intel) and Windows. Don't have Carmen open? Click "Try it with sample courses".

**AI tools:** Claude (Anthropic) for planning the app, writing all of the code, and testing it. The app uses Claude for the optional weekly brief.

**Process.** [Say how much coding you knew before.] I started by describing my problem in Chinese to Claude. My first idea was a website, but a website can't sign in to Canvas for you, so we switched to a desktop app with its own sign-in window. I asked for Mac only at first, then realized [lots of students use Windows and older Intel Macs], so we added both. Claude wrote the code, then took screenshots of the app and fixed what looked wrong. The biggest lesson: the first study plan crammed all exam prep into the night before, because small homework filled up the early days. We changed the planner to reserve time for exams and projects first and spread it out, and suddenly the plan looked like something a real student would follow.

**Lessons learned.**
- Be specific about what you want. "Warn me 2 weeks ahead and tell me which day to start" worked much better than "add reminders".
- Ask the AI to test its own work. Seeing screenshots caught problems I would have missed.
- Start with sample data so people can try your project without signing in.

## Prompts I used

These are real messages I sent to Claude (originally in Chinese, translated):

> I want to make something that reads all of my course content on Canvas and sums it up into weekly study tasks and a weekly study plan.

> I want an app, ideally software you just download from a website. I don't want it on the App Store. It should work like a crawler, and students should be able to sign in to their own Canvas by hand when they use it.

> My computer has Apple silicon, but when it's done I want people without Apple silicon to be able to use it too, and make a Windows version as well.

> Early warning: exams and big assignments in the next 2 weeks, and tell me which day to start preparing.

Original Chinese:

> ok我现在要做一个通过识别canvas上的所有关于学习课程的内容总结出每周的学习任务和学习计划

> 我要做app，最好是只从网站下载的软件，我不想上架app store。其次我要的是一个类似爬虫的软件，我要的是，学生使用的时候可以自己手动登陆自己的canvas

> 提前预警：未来 2周内的考试和大作业，提示该从哪天开始准备

## Photos and video

Attach a screenshot of the website, plus `docs/welcome.png`, `docs/screenshot-light.png` and `docs/screenshot-plan.png`.
A 30 to 60 second screen recording works best: open the app, click "Try it with sample courses", check off a task, and scroll to the study plan.
