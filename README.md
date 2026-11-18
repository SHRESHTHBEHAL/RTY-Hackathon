# 🚀 Buildathon: Make Wednesdays Great Again

**Masters' Union · For AI Developers · Winner gets Rs. 25,000**

> **Every team must build in a fork of this repository.** Projects not built in a fork of this repo won't be judged.

| | |
|---|---|
| **Date** | Wednesday, 18 November 2026 |
| **Hacking** | **3:00 PM – 7:00 PM IST** (code freeze at 7:00 PM sharp) |
| **Venue** | CDS Audi, 8th floor |
| **Prize** | Rs. 25,000 to the winning team |
| **Register your fork** | 👉 **[https://forms.gle/ZJUYKwTYjsMsVB2b9](https://forms.gle/ZJUYKwTYjsMsVB2b9)** (**deadline 3:30 PM IST**) |
| **Final submission** | Your fork as it stands at **7:00 PM IST**. There's nothing else to submit. |

> 🤖 **Using an AI coding agent?** Point it at [`AGENTS.md`](AGENTS.md). It has the full event brief, tracks, judging and rules in a form agents can read directly. Claude Code loads it automatically through `CLAUDE.md`, and Codex reads `AGENTS.md` natively.

---

## 🎯 Pick one build track

| # | Track | Brief |
|---|---|---|
| **01** | **Build for the Physical World** | Make a real-world task easier, faster or more reliable. Show it in a realistic scenario. |
| **02** | **Build for AI Agents** | Find something an agent struggles with. Build the tool that fixes it, then demo the agent using it. |
| **03** | **Build in Your Area of Expertise** | Pick a field you know firsthand. Ship a working product that improves how people handle it today. |

## ⚖️ How you'll be judged (each criterion is ⅓ of your score)

| Criterion | The question judges ask |
|---|---|
| **Working product** | Does it do what you say it does? Show the core workflow in your demo. |
| **Problem insight** | Who faces this problem, and why does it happen? |
| **Depth of execution** | How well did you solve the hardest part of the build? |

---

## Why fork this repo?

Everyone starts from the same commit (the **genesis commit**) at the same time. Organizers can then check that:
- all code was written **during** the Buildathon and not brought in from an earlier project,
- teams commit steadily instead of pasting in one huge AI-generated dump at the end,
- every repo stays public and visible while you build.

The organizers track every fork automatically: commits, timing and activity. Read [RULES.md](RULES.md) before you write any code.

---

## ✅ Setup (about 5 minutes, do it at 3:00 PM)

**In short:** fork → register your fork in the form **by 3:30 PM** → build → push before 7:00 PM.

### 1. Fork this repo
Click **Fork** (top right). On the fork screen:
- **Owner:** one team member's personal account. Only **one fork per team**.
- **Repository name:** `buildathon-<team-name>`, for example `buildathon-byte-bandits`
- Click **Create fork**.

> ⚠️ Don't download a ZIP or copy the files into a new repo. **It has to be a real GitHub fork**, or the tracker can't see you.

### 2. Keep it public
Forks of a public repo are public. **Don't make it private, archive it, or delete it** until judging is over.

### 3. Add your teammates
In your fork: **Settings → Collaborators → Add people**. Add each teammate's GitHub account so their commits count toward the team.

### 4. Enable Actions
Open the **Actions** tab of your fork and click **"I understand my workflows, go ahead and enable them"**. This runs the automatic check on every push.

### 5. Make your registration commit (your first commit)
Fill in [`team.json`](team.json). `track` must be one of `physical-world`, `ai-agents` or `area-of-expertise`. Then:

```bash
git clone https://github.com/<your-username>/buildathon-<team-name>.git
cd buildathon-<team-name>
# edit team.json
git add team.json
git commit -m "register: <team name>"
git push
```

The **Hackathon check** in the Actions tab should go green ✅. If it's red, open the run to see what's wrong in `team.json`.

### 6. Register your fork (deadline: 3:30 PM IST)
👉 **[https://forms.gle/ZJUYKwTYjsMsVB2b9](https://forms.gle/ZJUYKwTYjsMsVB2b9)**

It's a 4-question Google Form: team name, fork link, track, team members. It connects your repo to the organizers' live tracker.

- Fill it in **once per team**, right after forking, and **no later than 3:30 PM IST**. **Teams that don't register can't be tracked.**
- Paste your **fork's** URL (`https://github.com/<you>/buildathon-<team-name>`), not this starter repo's.
- Need to change something? Use the **"Edit your response"** link on the confirmation page. Don't fill it in twice.
- **Final submission is automatic.** Whatever is pushed to your fork at 7:00 PM IST is what gets judged.

---

## 🛠 While you build (3:00 – 7:00 PM)

- Put your code anywhere in the repo (`app/`, `src/`, `frontend/`, `backend/`…). There's no required layout.
- **Commit early, commit often**, at least every 30 minutes of real work, with messages that say what changed.
- **Push regularly.** Commits you never push don't exist to the tracker.
- AI coding tools (Claude Code, Codex, Cursor, Copilot…) are **allowed and encouraged**. Keep `AGENTS.md` and `CLAUDE.md` in the repo; they keep your agent within the rules.
- Before 7:00 PM, replace the "Your project" section below with your project's README.

## 🧊 Code freeze: 7:00 PM IST

At 7:00 PM the tracker takes a snapshot of every fork. **Commits pushed after code freeze are ignored.** Judges look at your last commit before 7:00 PM.

## ❌ Things that get you flagged

- Rewriting history (`git push --force`, rebasing away the genesis commit, squashing everything into one commit)
- Commits dated before 3:00 PM
- One or two giant commits containing most of the project
- A repo that isn't a fork of this one, or that's private or deleted

See [RULES.md](RULES.md) for the full list.

---

## Your project

### Gaitway: a payment gateway for AI agents

- **Team:** darWIN (Shreshth Behal, Ronit Pahuja, Aadhar Gupta)
- **Track:** Build for AI Agents (`ai-agents`)

#### Problem

Businesses now run AI agents that need to buy things on their own: an API
call, a message, a dataset, a few cents at a time. Today's payment rails
assume a human:
- cards need someone to type details and pass checks;
- fixed per-transaction fees make one-cent payments pointless;
- handing an agent the company card gives no per-agent budget, no limits,
  and no record of which agent spent what.

Sellers have no standard way to say "pay me per call" to an agent, and no
safe way to check that an agent can pay before serving it. So agents either
can't pay at all, or they are given far more access to money than they
should have.

#### What we built

- A **business** funds a wallet per agent and sets how much each may spend.
- A **seller** integrates Gaitway once, like a card gateway.
- An **agent** asks Gaitway for a short-lived signed credential naming the
  seller and a maximum. That amount is put on hold in its wallet.
- The seller verifies the credential locally, charges it through the API,
  and only then delivers. Unused hold returns to the wallet.
- The money sits in a vault smart contract holding USDC. A fast off-chain
  double-entry ledger tracks every wallet, and sellers are paid on-chain in
  batches. Nobody using Gaitway touches crypto or pays network fees.

| Part | Where |
|---|---|
| Vault contract and chain client | `contracts/`, `packages/chain/` |
| Ledger and HTTP API | `apps/api/` (see `apps/api/README.md`) |
| Seller and agent SDKs, MCP server, dashboard, demo | `packages/sdk/`, `packages/mcp/`, `apps/dashboard/`, `apps/demo/` |

Beyond the core flow:
- spending rules (per-payment, daily, allowed sellers)
- subscriptions (mandates), push transfers, refunds, withdrawals
- a seller directory, signed webhooks
- a policy hook, so a business can put its own approval service
  (for example Dwarpal) in front of every payment

#### The hardest part

Moving money correctly when many agents pay at once and anything can crash.
- Every balance change goes through one ledger function. It runs inside a
  single database transaction, locks accounts in a fixed order (so no
  deadlocks), and refuses to let any balance go negative. Amounts are whole
  millionths of a dollar, never floats.
- Charges are idempotent: a seller retrying after a timeout gets the
  byte-identical reply and the agent pays once.
- Settlement to the vault is keyed by batch ID. If the server dies after the
  on-chain payout but before recording it, the next run finishes the batch
  instead of paying twice.
- A reconciliation job checks the ledger against the vault after every
  settlement and stops settlement if money is missing.

These cases are tested against a real Postgres:
- 20 concurrent postings and concurrent credential requests on one wallet
- 10 concurrent charges on one credential
- a charge racing the expiry sweeper
- crashes before and after the vault call

#### How to run it

```bash
# Postgres (set GAITWAY_PG_PORT if 5432 is taken)
docker compose up -d --wait

# API on :8787 (in-memory vault by default; VAULT_DRIVER=chain for the real one)
cd apps/api && cp .env.example .env && pnpm install && pnpm dev

# Seed the demo business, seller "Relay" and three agents (50 / 30 / 0 dollars)
pnpm --filter @gaitway/api seed:demo

# Tests
pnpm --filter @gaitway/api test
```

Local chain, dashboard and demo: see `packages/chain/README.md` and the
`apps/` READMEs. The steps to wire everything together are in `context.md`
section 12.

#### Demo

1. A business signs up, creates three agents, tops up 100 test dollars and
   funds each wallet differently.
2. Relay, a sample messaging API, charges one cent per message.
3. An agent sends messages through Relay and pays as it goes, with no human.
4. The dashboard shows the agent's wallet falling and Relay's balance rising.
5. An agent with an empty wallet is refused.
6. Settlement pays Relay in test USDC on-chain, and reconciliation reports no
   difference.

Live (real-money) mode stays off until there is a licensing opinion, a
currency partner, an identity-check provider and an independent audit of the
vault. The currency and identity integrations are simulations today.
