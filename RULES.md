# Buildathon: Rules

By forking this repo and submitting it, your team agrees to these rules.

**Hacking window:** Wednesday 18 Nov 2026, **3:00 PM – 7:00 PM IST** · CDS Audi, 8th floor

## 1. Scope: build it here, build it now
1. All project code must be written **between 3:00 PM and 7:00 PM IST**, in your fork of this repo.
2. You **may** use open-source libraries, frameworks, public APIs, scaffolding tools (`create-next-app`, `vite`, etc.), and design assets you have the rights to.
3. You **may not** bring in application code from a project you (or anyone else) built before the Buildathon. That includes copying it in, importing it as a submodule, or vendoring it.
4. Thinking about ideas beforehand is fine. Writing the code beforehand isn't.
5. Your project must fit **one** of the three tracks: Physical World, AI Agents, or Area of Expertise.

## 2. Git history is your evidence
1. Your first commit after the genesis commit must be the **registration commit** (`team.json`).
2. Commit and push **at least every 30–60 minutes** while you're building. Use real commit messages.
3. **Never** force-push, rebase away, or squash the history on `main`. The genesis commit must stay in your history.
4. Big generated files (lockfiles, `node_modules`, build output, datasets) belong in `.gitignore`. They aren't counted as your work.
5. Only commits pushed **before 7:00 PM IST** are judged.

## 3. AI tools
1. AI coding assistants (Claude Code, Codex, Cursor, Copilot, ChatGPT, etc.) are **allowed**.
2. The AI must work **inside this repo**, during the hacking window, and its output must be committed incrementally like any other work. Don't generate an entire app elsewhere and paste it in at the end.
3. Keep `AGENTS.md` and `CLAUDE.md` in the repo. They tell AI agents to follow these rules.
4. Every team member must be able to explain any part of the code to the judges.

## 4. Repo requirements
- It's a **GitHub fork** of this repo (not a copy or a fresh repo)
- One fork per team, owned by a team member
- **Public**, from the moment you fork it until judging is over
- Not archived or deleted
- The fork is registered via the [registration form](https://forms.gle/ZJUYKwTYjsMsVB2b9) **by 3:30 PM IST**
- Your submission is your fork's state at 7:00 PM IST. Nothing is pushed after that counts

## 5. Judging
Each criterion is **one-third** of your score:
- **Working product:** Does it do what you say? Show the core workflow in your demo.
- **Problem insight:** Who faces this problem, and why does it happen?
- **Depth of execution:** How well did you solve the hardest part of the build?

## 6. What the organizers' tracker checks
Every fork is scanned automatically. It records:
- whether it's still a fork of the starter repo, and public
- whether the genesis commit is still in its history (no rewritten history)
- the number of commits, contributors and active time
- commits dated before 3:00 PM or after 7:00 PM
- unusually large single commits

A flag is **not** an automatic disqualification. The organizers review flagged repos and may ask your team to walk them through the history. Breaking the scope rules on purpose can lead to disqualification.
