# Next steps

This app is a first, working piece of a larger idea: a **thinking harness**. That means software that creates better conditions for thinking with AI, so that ideas come out bigger, more surprising, more rigorous and more useful. This document sets out the idea, what the app already does, and what to build next.

## The idea

The model for this is editorial work. Journalists constantly take vague ideas, provocations and observations and work with other people to turn them into stories. Different editorial cultures do this differently, with different results. Some rush to execution. The best spend time exploring and refining an idea first, and execution grows out of that.

Editors also contribute in different ways at different moments. One helps you discover what the story is. Another questions its larger purpose. A line editor works on expression, a copy editor on language, a fact-checker on claims. The culture decides who contributes what, and when.

A thinking harness tries to give you that kind of culture with AI. It does it in three ways:

1. **It distinguishes kinds of thinking.** Examples:
   - **Extraction:** help me see what I'm trying to say, with the least damage and the least "improvement."
   - **Clarification:** find the ambiguities and contradictions inside the idea.
   - **Challenge:** anything from gentle questions to steelmanning the opposite view.
   - **Expansion and narrowing:** open the idea up, then refine what emerges.
   - **Shaping for use:** turn it into an essay, a decision or something ready for production.
2. **It lets you choose how the AI works with you**, through a mode and a set of adjustable variables:
   - affirmation versus challenge
   - exploration versus solution
   - creative reach
   - speed versus depth
   - how much autonomous work happens in the background
3. **It holds those choices reliably.** Most time with today's models goes to correcting a model that adopted its own approach. In a harness, the chosen form of collaboration governs what happens, and a change takes effect immediately.

## What exists today

The app covers the second point and part of the third.

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
| Checking that the model obeyed | Not yet |
| Selective memory and verification | Not yet |

The keyboard steering and phone controls are early experiments in making these choices physical and playful. They come from the original [proposal](proposal.html).

## What we've learned from building it

- **The modes mix two different things.** Play and Extract are *activities*, kinds of thinking. Boss, Buddha and Influencer are *lenses*, whose eyes you see the work through. These should be separate choices. "Challenge, through the boss's eyes" and "Extract, through the boss's eyes" are both useful and quite different.
- **A dial's meaning depends on the activity.** Severe critique while exploring means attacking the question. Severe critique while shaping means attacking the answer. Editorial roles handle this naturally, because a top editor's challenge and a fact-checker's challenge are different jobs. Named roles may work better as presets than abstract dials, because people already know what each role does.
- **Obedience and surprise pull against each other.** Good editors sometimes break the mode you asked for: "I know you wanted line edits, but the story is wrong." A harness that forbids this loses some of the best interventions. One that allows it freely is back to ignoring you. The answer is probably a narrow, clearly marked channel for breaking the mode (see step 3).
- **The activity list has gaps.** Missing so far:
  - **Reporting:** go and get new material.
  - **Killing:** recommend dropping the idea. A harness that never does this is a form of sycophancy.
  - **Letting it sit:** deliberately stop working on it for a while.
  - **Holding you to your record:** "In March you argued the opposite."

## Next steps

Everything in this section can be built with current models, by orchestrating around them. The steps are listed in rough priority order.

### 1. Separate activities from lenses

Replace the single mode row with two choices:
- **Activity:** Extract, Clarify, Challenge, Expand, Narrow, Shape. Later, Report, Kill and Let it sit.
- **Lens:** none, Boss, Buddha, Influencer, and custom lenses you describe yourself.

Give each activity default dial positions that you can then adjust. Extract, for example, should start low on wildness and critique. The conversation and turn records already store a mode, so this is mostly a change to `public/modes.js`, the tile UI and the stored data.

### 2. Check that each reply obeyed

After each reply, a small, cheap model grades it against the active activity and dials. It flags or regenerates replies that break them. This only works with testable rules, such as:

- "Explore never proposes a solution."
- "Extract adds no new ideas."
- "Supportive raises no more than one objection."

Writing those rules is the real design work, and it is also the best way to find out what each mode means. Show a small indicator on each reply ("held" / "drifted") so people can see how reliable the harness is.

### 3. Add an editor's note

Give the model one sanctioned way to break the mode: a short, visually separate note under the reply, such as "Out of mode: I think the premise is wrong, because…". It must never take over the reply itself. The checker from step 2 enforces this. The same channel can later bring in background findings (step 6).

### 4. Change direction mid-reply

Stream replies and add a way to interrupt one. When a dial or mode changes during a reply, stop it, keep what was written, and restart with the new settings and the partial text. With fast models this can feel immediate. Today the app waits for complete replies and applies changes on the next turn.

### 5. Build an assumption ledger

This is the most important step. It addresses two problems that turn out to be one:
- **Starting fresh** loses good context, but carrying everything forward also carries the model's misreadings.
- **Approving long AI-written documents** you haven't really checked turns your approval into a false signal of validation.

Both are problems of **provenance**: where each claim came from. Magazine fact-checking is the existing institution for this. The checker traces every claim to a source and doesn't accept the writer's confidence as one. The ledger works the same way:

- **Record provenance when claims are written.** Tag each claim as something you said, something the model inferred, or something research supports. Don't reconstruct this afterwards, and don't ask the model what it assumed, because its answer is a plausible story, not a reliable report.
- **Rank by danger.** Score claims by consequence × uncertainty, weighted toward claims the model introduced. You check a short list instead of reading 40 pages.
- **Track dependencies** like a build system: record which claims each document relied on, so that when one claim falls you can see what rests on it.
- **Carry forward only what you confirmed.** Add a "fresh start" button that seeds a new conversation with confirmed claims only. Be careful with confirmation: if you say X, the model restates it as a slightly different X′, and you say "yes," you haven't necessarily confirmed X′.

The question this answers: **how can the system surface consequential assumptions at a volume a person can actually check, and trace what depends on them if they turn out to be wrong?**

### 6. Work alongside the conversation

While you think, background agents work on the same problem in different ways:

- **Reframing:** is this the real problem, a symptom, or an opportunity? Would a slight rewording reveal a bigger question?
- **Research:** academic evidence, creative approaches from blogs, historical examples, and your own earlier conversations.
- **Alternatives:** several significantly different solutions to the problem as currently framed, to borrow from.

These should start automatically, based on settings, rather than being commissioned one at a time. Timing is the hard part: a quiet signal is easy to forget, but interruptions break flow. A good default is to bring results in at **activity transitions**, such as moving from Expand to Narrow. That's the harness version of a story meeting. A fifth dial, **Autonomy**, controls how much of this happens.

### 7. A real "creative reach"

Turning up a model's randomness mostly produces noise, not bolder ideas. Instead, generate many candidates under deliberately different framings, then select for distance from the obvious answer (measured with embeddings). The Wildness dial then controls how far that selection reaches.

### 8. Physical controls

Return to the original proposal with better software underneath: knobs, pedals, and objects that select a lens or a thinking move. [`docs/PHYSICAL_OBJECT_IDEAS.md`](docs/PHYSICAL_OBJECT_IDEAS.md) has the design notes. Physical controls matter more once steps 2 and 4 make changes take effect reliably and immediately.

## Not yet possible

These need changes to models or their interfaces, so the harness has to work around them:

- **True mid-generation steering.** Hosted model APIs only allow stopping and restarting a reply. Running an open-weight model yourself would allow pausing and inserting instructions, but models aren't trained to take interruptions.
- **Guaranteed obedience.** Models are probabilistic, so reliability has to come from outside checks (step 2), not from the model.
- **Honest self-reports.** A model can't reliably say what it actually assumed. This is why provenance has to be recorded from the outside (step 5).
- **Hidden framing.** The deepest assumptions never appear in the text, because the model and the user often share them. A deliberately adversarial reframing agent helps, but nothing checks for this systematically.
- **Forgetting in place.** A model can't un-see part of its context. You can only rebuild a clean context without it.
- **Learning your editorial culture.** Today's "memory" is notes the model reads back, not learning from experience.
- **Calibrated doubt.** Models don't know how sure they are. Disagreement between independent agents is a rough stand-in.

**Takeaway:** mid-turn control is mostly an interface limit, and stop-and-restart covers most of it. Verification is the deeper problem, so it has to be built like fact-checking: the system records where claims came from instead of trusting the model's account.

## Open questions

- Should the harness **obey** your settings, or **read** you and suggest them? A middle path: the model infers the activity, states its guess, and lets you override it instantly.
- Which activities and lenses are actually useful? Which are missing?
- How should the harness sense your state? A quick note you want recorded shouldn't turn into an extended discussion.
- How much of this applies to coding? Coding tools like Jesse Vincent's [Superpowers](https://github.com/obra/superpowers) already shape how agents work, but much of the problem is upstream: working out what problem you're trying to solve.
- As models get better at execution, getting vague, emerging human ideas into a form they can work with may become one of our main jobs. What would a harness built for that look like?
