# Next steps

This app is a first, working piece of a larger idea: a **thinking harness**. That means software that creates better conditions for thinking with AI, so that ideas come out bigger, more surprising, more rigorous and more useful. This document sets out the idea, where the app stands, and what to build and test next.

## The idea

The model is editorial work. Journalists constantly take vague ideas, provocations and observations and work with other people to turn them into stories. Different editorial cultures do this differently, with different results. Some rush to execution. The best spend time exploring and refining an idea first, and execution grows out of that.

Editors also contribute in different ways at different moments. One helps you discover what the story is. Another questions its larger purpose. A line editor works on expression, a copy editor on language, a fact-checker on claims. The culture decides who contributes what, and when.

A thinking harness tries to give you that kind of culture with AI:

1. **It distinguishes kinds of thinking.** Examples:
   - **Extraction:** help me see what I'm trying to say, with the least damage and the least "improvement."
   - **Clarification:** find the ambiguities and contradictions inside the idea.
   - **Challenge:** anything from gentle questions to steelmanning the opposite view.
   - **Expansion and narrowing:** open the idea up, then refine what emerges.
   - **Shaping for use:** turn it into an essay, a decision or something ready for production.
2. **It lets you choose how the AI works with you.** You pick a mode and adjust variables:
   - affirmation versus challenge
   - exploration versus solution
   - creative reach
   - speed versus depth
   - how much autonomous work happens in the background
3. **It holds those choices reliably.** Much of the time spent with today's models goes to correcting a model that has adopted its own approach. In a harness, the chosen form of collaboration governs what happens, and a change takes effect immediately.

### The hypothesis

Underneath this is a testable claim: **intellectual moves that are usually implicit can become tangible actions that people discover, manipulate and combine, and that changes the thinking itself.**

- A **Critique** dial makes explicit something people struggle to say in words: how hard they want their reasoning challenged.
- A **figurine** turns "whose judgment should I consider?" into an object you put in front of you.
- A pair of **scissors** turns editing into an action, instead of another attempt at the perfect prompt.

If that's true, these controls aren't shortcuts. They make certain thinking moves visible and available, and may change which thoughts people have. That needs to be tested, not assumed.

## Where it stands

The app makes the AI **adjustable**. It hasn't yet shown that it makes the AI a **better thinking partner**. Closing that gap is the point of everything below.

| Harness idea | In the app now |
|---|---|
| Affirmation versus challenge | **Critique** dial: Sycophantic → Adversarial |
| Exploration versus solution | **Implementation** dial: Feel around → Make it happen |
| Creative reach | **Wildness** dial: Conventional → Ridiculous |
| Speed versus depth | **Thinking effort** dial: Low → Max (model reasoning effort) |
| Autonomous background work | Not yet |
| Modes | Play, Extract, Boss, Buddha, Influencer |
| Holding your choices | The server stores the mode and dials, re-sends them with every request, and records the settings behind each reply |
| Changing direction | Changes apply to the **next** message, not the reply in progress |
| Acting on part of the work | Not yet: every change shapes the next reply as a whole |
| Checking that the model obeyed | Not yet |
| Selective memory and verification | Not yet |

**What's solid:**
- The architecture is simple and suits a small always-on machine: a dependency-free Node server, SQLite, and plain browser JavaScript.
- The dials are independent, so exploring and executing aren't opposite ends of one scale.
- Every reply records the exact settings that produced it, which is good for both use and experiments.
- The infrastructure is careful: the key stays on the server, conversations stay local, browsers must pair, and spending is reserved before each call.

Most of the backend should be kept.

## What we've learned

- **The controls shape the reply, not what it acts on.** This is the biggest gap between the original proposal and the app. You can change the character of the next reply, but you can't point at a passage, choose an alternative to develop, or say what an intervention applies to. "Scissors" could mean cut the business model to its essentials, shorten the pitch, or remove the weakest argument. The instrument needs a way to connect a move to the piece of work it acts on.
- **The default is too directive.** New conversations start at *Make it happen*, the most execution-heavy position. For someone arriving with a half-formed idea, that invites exactly the failure the harness exists to prevent: leaping to solutions while the person is still finding the question.
- **The modes mix two different things.** Play and Extract are *activities*, kinds of thinking. Boss, Buddha and Influencer are *lenses*, whose eyes you see the work through. These should be separate choices. "Challenge, through the boss's eyes" and "Extract, through the boss's eyes" are both useful, and quite different.
- **Lenses are styles, not yet perspectives.** Today a lens is a paragraph added to the instructions, which changes tone. A real perspective would be identifiable and persistent, remember things (your boss's actual priorities), and be able to disagree with other perspectives.
- **A dial's meaning depends on the activity.** Severe critique while exploring attacks the question. Severe critique while shaping attacks the answer. Editorial roles handle this naturally, so named roles may work better as presets than abstract dials.
- **Obedience and surprise pull against each other.** Good editors sometimes break the mode you asked for: "I know you wanted line edits, but the story is wrong." A harness that forbids this loses some of the best interventions. One that allows it freely is back to ignoring you.
- **The activity list has gaps.** Missing so far:
  - **Reporting:** go and get new material.
  - **Killing:** recommend dropping the idea. Never doing so is a form of sycophancy.
  - **Letting it sit:** deliberately stop working on it for a while.
  - **Holding you to your record:** "In March you argued the opposite."
- **The AI can only talk.** It has no tools, research or persistent output, so *Make it happen* can only ever produce a chat reply.

## Next steps

Resist perfecting the hardware first. The consequential question is whether these controls improve thinking at all. The steps below test that on screen, then build on whatever works. Everything here is possible with current models, by orchestrating around them.

### 1. Quick fixes

These are small changes that remove friction before any experiment:

- **Default to *Explore this*** (Implementation 2) for new conversations. People should turn toward execution deliberately.
- **Tell the model about past interventions.** Today it sees the conversation's text but not the settings or lenses that shaped each earlier reply. A short note per turn ("this reply: Adversarial, Outlandish, Boss lens") gives it the history of the collaboration, not just its words.
- **Make the model and prices configuration**, not constants in `src/provider.js` and `src/pilot.js`.
- **Recommend an OpenAI project spending limit** in the README. The app's budget is local accounting and can't cap real billing.
- **Add conversation deletion**, and an option to review a speech transcript before it's sent.

### 2. Experiment: does steering actually work?

Take a few unfinished ideas. Run each one across contrasting combinations of the Implementation, Wildness, Critique and lens settings. Then ask whether the changes produce **substantively different thinking**, or just different tones.

Build this as a repeatable script, not a one-off. It's also the first version of a **mode checker**: a small, cheap model that grades each reply against testable rules for its settings. For example:
- "Explore never proposes a solution."
- "Extract adds no new ideas."
- "Supportive raises no more than one objection."

Writing those rules forces precise definitions. Once the checker exists, run it on every live reply too. It can flag or regenerate replies that drift, and show a small "held / drifted" mark so people can see how reliable the harness is.

### 3. Targets and moves

Add explicit **targets** and **moves** alongside the persistent settings:

- **Target:** the latest reply, a passage you select, or the working document (step 4).
- **Move:** a one-time operation on that target, such as Challenge, Expand, Cut, Examine, Transform or Compare.

Prototype the moves as on-screen objects before any NFC: **Scissors** (cut), **Fireworks** (go wild), **Magnifying glass** (examine an assumption). Each must do something distinctly different to the selected work.

At the same time, split the mode row into **activity** (Extract, Clarify, Challenge, Expand, Narrow, Shape) and **lens** (none, Boss, Buddha, Influencer, custom). Each activity gets its own default dial positions.

### 4. A working document

Give the AI one substantive capability beyond chatting: a **persistent document it creates and revises** alongside the conversation. This is where *Make it happen* finally produces something, and where targets and moves get real material to act on. It's also the natural home for the assumption ledger (step 7).

### 5. Experiment: a council of perspectives

Turn lenses into **perspectives**: named, persistent, able to remember (for example, your boss's actual priorities) and able to disagree. Put two or three in front of an idea at once:
- Each responds separately.
- The harness shows where they disagree.
- You choose which threads to pursue.

The test is whether those disagreements produce more insight than one AI wearing a blended persona. This may be the most distinctive thing the instrument can do.

### 6. Change direction mid-reply, with an editor's note

- **Streaming and interruption.** Stream replies, so there's no long silence. If a dial or mode changes during a reply, stop it, keep what was written, and restart with the new settings and the partial text. With fast models this feels immediate.
- **An editor's note.** Give the model one sanctioned way to break the mode: a short, visually separate note under the reply, such as "Out of mode: I think the premise is wrong, because…". It must never take over the reply, and the checker from step 2 enforces that.

### 7. An assumption ledger

This addresses the draft's two tier-one problems, which turn out to be one:
- **Starting fresh** loses good context, but carrying everything forward also carries the model's misreadings.
- **Approving long AI-written documents** you haven't really checked turns your approval into a false signal of validation.

Both are problems of **provenance**: where each claim came from. Magazine fact-checking is the model here. The checker traces every claim to a source and doesn't accept the writer's confidence as one. The ledger works the same way:

- **Record provenance when claims are written** into the working document: something you said, something the model inferred, or something research supports. Don't reconstruct this afterwards, and don't ask the model what it assumed; its answer is a plausible story, not a reliable report.
- **Rank by danger.** Score claims by consequence × uncertainty, weighted toward claims the model introduced, so you check a short list instead of 40 pages.
- **Track dependencies** like a build system: record which claims each section relied on, so that when one claim falls you can see what rests on it.
- **Carry forward only what you confirmed.** A "fresh start" seeds a new conversation with confirmed claims only. Be careful with confirmation: if you say X, the model restates it as a slightly different X′, and you say "yes," you haven't necessarily confirmed X′.

The question this answers: **how can the system surface consequential assumptions at a volume a person can actually check, and trace what depends on them if they turn out to be wrong?**

### 8. Work alongside the conversation

Background agents work on the same problem in different ways while you think:

- **Reframing:** is this the real problem, a symptom, or an opportunity?
- **Research:** academic evidence, creative approaches, historical examples, and your own earlier conversations.
- **Alternatives:** several significantly different solutions to borrow from.

They should start automatically, based on settings, rather than being commissioned one by one. Bring their results in at **activity transitions**, such as moving from Expand to Narrow, which is the harness version of a story meeting. A fifth dial, **Autonomy**, controls how much of this happens.

### 9. A real "creative reach"

Turning up a model's randomness mostly produces noise, not bolder ideas. Instead, generate many candidates under deliberately different framings, then select for distance from the obvious answer (measured with embeddings). The Wildness dial controls how far that selection reaches.

### 10. Physical controls

Once on-screen moves and perspectives have proven useful, test whether physical versions make them easier or more inviting: knobs, pedals, and objects that select a lens or perform a move. [`docs/PHYSICAL_OBJECT_IDEAS.md`](docs/PHYSICAL_OBJECT_IDEAS.md) has the design notes. Physical controls matter most once steps 2 and 6 make changes take effect reliably and immediately.

## Not yet possible

These need changes to models or their interfaces, so the harness has to work around them:

- **True mid-generation steering.** Hosted model APIs only allow stopping and restarting a reply. Running an open-weight model yourself would allow pausing and inserting instructions, but models aren't trained to take interruptions.
- **Guaranteed obedience.** Models are probabilistic, so reliability has to come from outside checks (step 2), not from the model.
- **Honest self-reports.** A model can't reliably say what it actually assumed, which is why provenance has to be recorded from the outside (step 7).
- **Hidden framing.** The deepest assumptions never appear in the text, because the model and the user often share them. A deliberately adversarial reframing agent helps, but nothing checks for this systematically.
- **Forgetting in place.** A model can't un-see part of its context. You can only rebuild a clean context without it.
- **Learning your editorial culture.** Today's "memory" is notes the model reads back, not learning from experience.
- **Calibrated doubt.** Models don't know how sure they are. Disagreement between independent agents is a rough stand-in.

**Takeaway:** mid-turn control is mostly an interface limit, and stop-and-restart covers most of it. Verification is the deeper problem, so it has to be built like fact-checking: the system records where claims came from instead of trusting the model's account.

## Open questions

- Should the harness **obey** your settings, or **read** you and suggest them? A middle path: the model infers the activity, states its guess, and lets you override it instantly.
- Which activities, lenses and moves are actually useful? Which are missing?
- How should the harness sense your state? A quick note you want recorded shouldn't turn into an extended discussion.
- How much of this applies to coding? Coding tools like Jesse Vincent's [Superpowers](https://github.com/obra/superpowers) already shape how agents work, but much of the problem is upstream: working out what problem you're trying to solve.
- As models get better at execution, getting vague, emerging human ideas into a form they can work with may become one of our main jobs. What would a harness built for that look like?
