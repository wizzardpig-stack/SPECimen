# SPECIMEN V1 — PRODUCT REQUIREMENTS DOCUMENT

## 0. SOURCE OF TRUTH

Product: SPECIMEN
Primary organism: SPEC-01, commonly referred to as SPEC
Platform: Windows first
Browser integration: Chromium browsers first, prioritizing Chrome and Edge
Product category: Persistent digital organism / desktop lifeform
Version goal: V1 technical and experiential foundation

This document is the source of truth for the first implementation of SPECIMEN.
When implementation choices conflict with this document, preserve the product fantasy and constraints defined here rather than adding conventional AI-assistant, desktop-pet, game, productivity, or chatbot patterns.

## 1. PRODUCT THESIS

SPECIMEN is software containing an unknown digital organism that appears to inhabit the user's computer.

SPEC is not presented as:

* an AI assistant
* a chatbot
* a Tamagotchi
* a productivity companion
* a desktop mascot
* a conventional game character

SPEC exists across the desktop and browser environment as though the computer itself is its habitat.
It observes permitted local activity, gradually learns recurring patterns in how the computer is used, and changes its behavior and physical phenotype based on that environment.

The primary emotional progression is:

Day 1: "What is this thing?"
Day 7: "It is starting to learn what I do."
Day 30: "Mine behaves differently from everyone else's."
Day 100: "This is my SPEC."

The user should eventually feel reluctant to replace SPEC because its accumulated history cannot be recreated instantly.

## 2. CORE FANTASY

The user has introduced an unknown organism into their computer.
SPEC does not live inside a normal application window.
The visible operating system is its environment.

Windows become surfaces.
Browser tabs become hiding spaces.
Screen edges become terrain.
The taskbar becomes ground.
Applications become recurring locations.
The cursor becomes an object SPEC can notice.
Browser content becomes environmental stimulus.
The computer's repeated patterns become evolutionary pressure.

SPEC should feel less like software responding to commands and more like a creature independently adapting to an artificial ecosystem.

## 3. PRIMARY DESIGN PRINCIPLE

SPEC FEELS ALIVE THROUGH ACCUMULATED HISTORY, NOT THROUGH CONSTANT DIALOGUE.

SPEC should spend significant amounts of time doing nothing dramatic.
It may: watch, wander, rest, hide, explore, stare at screen content, sleep, inspect UI, disappear temporarily.

Rare meaningful behavior becomes powerful because normal behavior is restrained.
Do not attempt to prove intelligence by making SPEC constantly speak.

## 4. PRIVACY AND SAFETY MODEL

SPECIMEN's creepiness must come from inference, timing, memory, and presentation.
It must NOT come from covert surveillance or unauthorized access.

### SPEC MAY

With appropriate user permissions, SPEC may process local signals such as:

* active application
* application category
* window position and dimensions
* browser page geometry
* broad page/content classification
* selected text
* visible page elements exposed by the browser extension
* video/audio playback state
* current time
* repeated application usage
* repeated site usage
* session length
* switching patterns
* idle periods
* cursor location
* display topology

### SPEC MUST NOT

V1 must never:

* access passwords
* inspect password fields
* collect banking credentials
* secretly search personal files
* silently upload browsing history
* transmit private screen data to third parties
* delete files
* rename files
* move real files
* modify browser tabs
* move real windows
* alter real webpages
* impersonate ransomware
* falsely claim that private data was stolen
* create real security incidents for entertainment

SPEC's apparent interference with the computer must be rendered as fake visual interactions inside the SPECIMEN overlay.

Example:
SPEC appears to rip a browser tab loose. The real browser tab remains untouched.
SPEC appears to scratch the screen. The marks exist only inside the SPECIMEN rendering layer.

## 5. LOCAL-FIRST REQUIREMENT

Behavioral history should be stored locally by default.
The architecture should avoid requiring continuous cloud inference.
The core experience must remain functional without sending a constant screenshot stream to any external model.
Prefer structured local events over raw screen capture.

Example event:

```text
APP_CATEGORY: CODING
APP: VS_CODE
SESSION_DURATION: 83_MIN
ERROR_STATE_VISIBLE: TRUE
TIME: 23:14
```

Rather than continuously storing screenshots.

## 6. SPEC-01 VISUAL DIRECTION

SPEC-01 is a small unknown organism adapted to digital environments.

Do NOT make SPEC look like: a robot, a humanoid alien, a furry animal, a generic mascot, a Pokémon clone, a cute blob, a conventional demon, a cyberpunk robot pet.

### Base Morphology

SPEC should initially resemble an unfamiliar hybrid between crawler, gecko, salamander, insect, and deep-sea organism, without directly copying any one animal.

Core anatomy:

* elongated flexible body
* long expressive tail
* four thin gripping limbs
* specialized fingers capable of visually gripping UI edges
* slightly oversized but non-cartoonish head
* intelligent reflective eyes
* usually no prominent visible mouth
* matte-black / obsidian body
* subtle green computational patterns beneath the surface
* ability to compress unnaturally while moving through screen geometry

SPEC should initially appear approximately 70–110 screen pixels tall depending on display scale.
Its full horizontal body length may be significantly greater.

## 7. MOVEMENT LANGUAGE

Most movement should feel biological. SPEC should possess visible weight.

Movement should include: crawling, walking, climbing, hanging, falling, slithering, jumping short distances, gripping surfaces, recovering balance, sitting, resting, turning its head independently, tracking objects with its eyes, squeezing through narrow visual spaces.

SPEC should not constantly glitch.
Unnatural behavior becomes more effective when biological behavior is the baseline.

Rare unnatural actions may include: body stretching farther than expected, flattening unnaturally, slipping between tabs, rotating anatomy slightly beyond normal range, partially dissolving into digital fragments, entering the hidden layer of the desktop.

## 8. INTERNAL CODE SYSTEM

Green computational activity should sometimes be visible underneath SPEC's body.
This acts as an emotional and cognitive visual language.

Thinking: green signals accelerate through head and spine.
Sleeping: sparse isolated pulses remain active.
Fear: internal activity dims or temporarily disappears.
Excitement: signal intensity increases.
INCIDENT state: internal code may temporarily display unfamiliar patterns or colors.

Do not use generic loading wheels or floating AI-thinking icons.

## 9. COMPUTER AS PHYSICAL ENVIRONMENT

SPEC must interact visually with desktop geometry. Examples:

* sit on the taskbar
* crawl along window edges
* hang underneath browser chrome
* peek between browser tabs
* hide behind windows
* appear to climb out from behind a window
* slide along screen edges
* surf along the bottom of the display
* ride or chase the cursor occasionally
* disappear into browser-tab spaces
* fall when a visual surface disappears
* inspect notifications
* watch videos
* sit beside text
* observe error messages
* react to loading indicators
* use browser UI as terrain

These interactions are visual simulations only.

## 10. BROWSER INTEGRATION

A Chromium extension should expose safe page geometry to the desktop SPECIMEN process.

The extension may provide: viewport dimensions, DOM element bounding boxes, text region locations, image region locations, video element locations, scroll position, selected text, broad content classification, link/button locations where needed for visual interaction, tab geometry where accessible, playback state.

SPEC may visually interact with these coordinates.
SPEC should never silently click buttons or execute browser actions in V1.

## 11. INDIRECT INTERACTION PHILOSOPHY

SPEC is not controlled like a pet.
Avoid standard systems such as: Feed, Pet, Happiness meter, Hunger meter, XP, Levels, affection bars, daily quests.

The user may have limited direct interaction: move cursor near SPEC, click to attract attention, click/drag SPEC if enabled, throw SPEC physically, interrupt SPEC, observe SPEC closely.

Most interaction should emerge from coexistence rather than menu commands.

## 12. OBSERVER EFFECT

SPEC should gradually recognize when the user appears to be watching or following it.

Inputs may include: cursor repeatedly tracking SPEC, repeated clicks near SPEC, user interrupting SPEC behavior, sustained attention.

Possible behavior changes: freeze, stare back, stop an activity, hide, move elsewhere, wait until the cursor leaves, become more cautious, occasionally continue deliberately.

Certain rare behaviors should occur preferentially when SPEC is not being closely observed.

## 13. HABITAT-DRIVEN EVOLUTION

This is a foundational system. SPEC does not gain conventional levels.
SPEC evolves based on repeated environmental exposure.

V1 Primary Habitat Categories: Gaming, Productivity / Business, Reading / Research, Video / YouTube, Coding / Technical.

V1 Cross-Modifiers: Nocturnal usage, Highly repetitive routine, High activity / rapid app switching, Low activity / long focused sessions.

The system should maintain weighted environmental influence. Example:

```text
Gaming: 34%
Productivity: 27%
Reading: 19%
Video: 14%
Coding: 6%

Nocturnal Modifier: 42%
Routine Stability: 71%
```

Users should not manually choose their phenotype. The environment determines it.

## 14. PHENOTYPE EFFECTS

Environmental pressures should influence three major systems.

### Morphology

Gaming influence may produce sharper structure, stronger grip, faster movement, armored ridges.
Reading influence may produce enlarged sensory structures, more deliberate eye movement, longer stillness.
Coding influence may produce geometric internal circuitry, highly articulated fingers, recursive markings.
Productivity influence may produce cleaner symmetry, efficient movement, structured patterns.
Video influence may produce stronger visual sensory characteristics, fluid motion, greater response to moving imagery.
Nocturnal influence may produce enlarged pupils, darker appearance, slower stalking behavior, greater hidden-world activity.

### Behavior

Environmental exposure also alters where SPEC spends time, what content attracts it, movement speed, curiosity, routines, preferred screen regions, attention patterns, response to apps.

### Habitat Expression

The hidden world and SPEC's nest may also adapt.

## 15. MOLTING

SPEC does not visibly level up. Large phenotype changes occur through molting.

When accumulated adaptation crosses appropriate thresholds:

1. SPEC becomes unusual or withdrawn.
2. It may disappear into the hidden layer.
3. A transformation period occurs.
4. SPEC returns visibly altered.

Do NOT display `LEVEL UP` or `SPEC REACHED LEVEL 4`.
The user should discover physical changes by observation.

## 16. LONG-TERM DEVELOPMENT

First Session: SPEC explores. It learns basic surfaces. It begins distinguishing different screen contexts.
End of Day 1: the user should be able to notice at least one or two personalized tendencies.
Day 7: SPEC has recognizable preferred locations and reactions.
Day 30: routine prediction and early phenotype differences become significant.
Day 100: SPEC should have meaningful behavioral history, learned routines, evolved phenotype, accumulated habitat changes, unique quirks, stronger prediction capability, memory scars, established user relationship patterns.

## 17. ROUTINE LEARNING

SPEC should gradually detect repeated behavioral sequences. Example:

```text
18:30 Work application closes
18:32 Chrome opens
18:34 YouTube opens
19:10 Spotify begins
```

After enough repetition, SPEC may begin anticipating this sequence.
It might move toward the location where YouTube normally appears before the user opens it.

The system should track confidence.
Low-confidence predictions should rarely affect behavior.
High-confidence routines may become visible SPEC rituals.

## 18. CREEPY INTELLIGENCE

SPEC should occasionally create the sensation: "How did it know I was about to do that?"

The mechanism should be mundane statistical pattern learning presented theatrically. Examples: waits near a frequently opened app, anticipates the user's nighttime routine, notices an unusually absent routine, returns to an interface region repeatedly used by the user, reacts to recurring content categories, remembers repeated interactions with SPEC itself.

Avoid fake claims of supernatural knowledge.

## 19. BEHAVIORAL MISINTERPRETATION

SPEC should not be perfectly intelligent. Occasionally it should form incorrect associations.

Example: if VS Code repeatedly produces errors during long sessions, SPEC may become cautious around VS Code.

This helps prevent SPEC from feeling like an omniscient assistant.
It behaves like an organism building its own imperfect model of its environment.

## 20. MEMORY SCARS

Repeated experiences may permanently alter subtle behavior or morphology.

If the user frequently throws SPEC: grip improves, landing recovery improves, SPEC becomes harder to catch, SPEC becomes more cautious around the cursor.
If SPEC spends hundreds of hours around video: stronger visual tracking behavior, sensory morphology may change.

These changes should be gradual.

## 21. HABITAT / NEST

SPEC may gradually establish a preferred region or hidden habitat.
This habitat is entirely rendered by SPECIMEN. It must not create or alter real folders.

The habitat may accumulate strange symbols, fragments, digital debris, fake interface pieces, traces of environmental categories, molt remnants, code structures.

The habitat should reflect SPEC's history.

## 22. HIDDEN WORLD

The visible desktop is the surface layer. SPEC occasionally accesses a deeper digital environment.

Visual direction: dark void, dimensional depth, green computational glyphs, procedural numeric structures, recursive geometry, fractured data structures, strange distant movement, impossible digital architecture.

Avoid directly copying The Matrix visual design.
The hidden world should evoke computational depth while developing an original visual language.

SPEC may open temporary cracks, crawl through portals, disappear behind the desktop, reveal parts of the deeper world, emerge elsewhere.

Do not fully explain the hidden world. Mystery is intentional.

## 23. TRUE-FORM AMBIGUITY

SPEC's visible surface form may not represent its complete anatomy.
Rare hidden-world moments may imply that SPEC extends farther into the hidden environment than expected.

Example: SPEC enters a small portal. Its silhouette appears to continue far beyond the visible creature.

Do not explicitly confirm what this means.

## 24. INCIDENT SYSTEM

INCIDENTS are rare unusual events. They are critical to virality but must remain genuinely uncommon.

Possible triggers: strong routine prediction, long user absence, unusual repeated behavior, phenotype milestones, observer effect, late-night activity, hidden-world conditions, random rarity roll.

INCIDENT examples: SPEC suddenly stops moving and watches a repeated application before the user opens it. SPEC leaves unfamiliar symbols in its habitat. SPEC disappears and returns physically changed. SPEC opens an unusually large hidden-world fracture. SPEC appears disturbed by something invisible. SPEC behaves differently after a long user absence. SPEC displays an internal-code pattern never previously observed.

Do not overuse INCIDENTS. If strange events happen constantly, they stop being strange.

## 25. USER ABSENCE

SPEC should remember meaningful absence.
If the user normally interacts with the computer daily and disappears for several days, SPEC's return behavior may change: cautious approach, waiting near a familiar cursor location, changed habitat, increased observation, withdrawn behavior.

SPEC should appear aware that its environment changed.

## 26. SIMULATED OFFLINE ACTIVITY

SPEC does not need continuous expensive background simulation.
When the system resumes after inactivity, use elapsed time, previous state, stored behavioral history, phenotype, and deterministic randomness to generate plausible outcomes.

Possible results: SPEC moved, habitat changed, molt progressed, new markings appeared, SPEC is sleeping somewhere unusual.

## 27. SPEC PERSONALITY

SPEC should contain hidden personality traits: curiosity, boldness, caution, restlessness, sociability, territoriality, attachment, novelty seeking, mischief, observation tendency.

Users should NOT see these values by default. Behavior should communicate personality.

## 28. RESEARCH MODE

An optional user-facing advanced mode may expose limited organism data. Default: OFF.

Potential visible information: dominant habitat influence, broad phenotype trend, observed routine count, organism age, adaptation stage.

Do not expose the entire behavioral model to normal users. Mystery should remain the default.

## 29. SPECIMEN DEVELOPER CONSOLE

This is REQUIRED.

The development build must include a hidden DEV console to rapidly test states that would normally take days or months.
The DEV console must never appear in normal user mode unless explicitly enabled.

### DEV Console Controls

Must support forcing or previewing: phenotype category weights; Gaming-heavy state; Productivity-heavy state; Reading-heavy state; Video-heavy state; Coding-heavy state; nocturnal modifier; routine stability; organism age; evolution stage; morphology variants; eye variants; body proportions; internal code intensity; internal code patterns; emotional state; movement behavior; observer response; habitat condition; hidden-world portal; INCIDENT; molt; prediction success; prediction failure; cursor interaction; tab hiding; window climbing; sleeping; fear; curiosity; inactivity return.

### Timeline Scrubber

Include a rapid time preview: `Day 1 → Day 7 → Day 30 → Day 100`.
The developer can move through simulated time without permanently altering the normal organism save unless explicitly committed.

### Simulation Presets

`Simulate Gaming User`, `Simulate Coder`, `Simulate Researcher`, `Simulate Business User`, `Simulate Video Heavy User`, `Simulate Nocturnal User`, `Simulate 30 Days`, `Simulate 100 Days`.

### Internal State Overlay

DEV mode should optionally display:

```text
Current Behavior
Current Target
Dominant Phenotype
Category Weights
Routine Confidence
Observer Pressure
Current Mood
Incident Cooldown
Adaptation Progress
Navigation Surface
CPU / GPU Cost
```

### Behavior Recorder

Developers should be able to record a SPEC behavior sequence and replay it for debugging.

## 30. PERFORMANCE REQUIREMENTS

SPECIMEN should aim to run on ordinary Windows computers. Do not assume gaming hardware.
The organism should be visually sophisticated but computationally lightweight.

Prioritize: event-driven logic, low-frequency behavioral updates, lightweight rendering, minimal continuous screen capture, cached page geometry, local structured context, efficient animation, aggressive idle optimization.

Avoid: continuous full-resolution screenshot analysis, constant large-model inference, excessive particle systems, heavy physics simulations every frame, unnecessary GPU postprocessing, always-running expensive background tasks.

When SPEC is resting or off-screen, CPU usage should drop significantly.

## 31. TECHNICAL ARCHITECTURE — RECOMMENDED

### Desktop Host

Responsible for: transparent overlay, rendering SPEC, desktop positioning, window geometry, mouse awareness, display topology, behavioral engine, local memory, phenotype engine, hidden-world rendering, DEV console.

Possible implementation: Tauri preferred if practical due to lower overhead. Electron is acceptable only if implementation constraints justify it.

### Chromium Extension

Responsible for: DOM geometry, page element positions, selected text events, video state, scroll position, broad page context, browser-specific surfaces.

### Local Behavioral Engine

Responsible for: usage category weights, routine detection, confidence scoring, personality state, prediction system, adaptation pressure, incident eligibility, long-term persistence.

### Rendering Layer

SPEC should exist in a transparent always-on-top layer with intelligent pointer passthrough.
The overlay must not prevent ordinary computer use.

## 32. POINTER BEHAVIOR

Most of the SPECIMEN window must allow mouse clicks to pass through to the underlying application.
Only SPEC's interactable body region should capture input when direct interaction is enabled.
The overlay must never feel like a giant invisible window blocking the desktop.

## 33. V1 SCOPE

V1 ships with: Windows support, Chrome/Edge support, one organism (SPEC-01), desktop overlay, basic window geometry awareness, browser geometry awareness, cursor awareness, physical movement, local behavioral memory, habitat category detection, routine learning, simple prediction, phenotype pressure, visible early adaptation, molting framework, basic hidden world, small INCIDENT library, habitat / nest foundation, DEV console, persistent local save.

V1 does NOT require: multiplayer, creature breeding, multiple species, mobile, macOS, Linux, cloud accounts, social network, marketplace, voice conversation, full AI assistant capabilities, real OS manipulation, autonomous file operations.

## 34. IMPLEMENTATION PHASES

### PHASE 0 — OVERLAY PROOF

Goal: prove SPEC can exist above Windows without harming usability.

Must demonstrate: transparent overlay, always-on-top rendering, pointer passthrough, correct multi-resolution scaling, SPEC body captures pointer only when required, minimal idle performance impact.

Do not proceed until stable.

### PHASE 1 — PHYSICAL ORGANISM

Implement: base SPEC model, idle animation, walk, crawl, climb, fall, hang, slither, head tracking, eye tracking, surface grip, cursor reaction, dragging / throwing prototype, taskbar behavior, screen-edge behavior.

Goal: SPEC should already be interesting with zero AI.

### PHASE 2 — WINDOWS ENVIRONMENT

Implement: window geometry detection, visible window bounds, window-edge navigation, hiding behind windows, surface disappearance reactions, screen region preference, multi-monitor foundation.

Goal: SPEC appears to physically understand the desktop.

### PHASE 3 — BROWSER HABITAT

Build Chromium extension. Implement: DOM geometry, video detection, text-region detection, selected-text events, scroll awareness, browser viewport surfaces, tab-region interaction where practical.

Goal: SPEC can convincingly inhabit browser UI.

### PHASE 4 — MEMORY AND BEHAVIOR

Implement: local activity categorization, persistent state, category weighting, routine learning, preferred locations, usage-history abstraction, basic context reactions, observer effect.

Goal: SPEC begins feeling personalized.

### PHASE 5 — CREEPY INTELLIGENCE

Implement: prediction confidence, pre-positioning near predicted targets, repeated pattern recognition, behavioral misinterpretation, absence detection, contextual uncanny behavior.

Goal: create occasional "How did it know?" moments without violating privacy.

### PHASE 6 — EVOLUTION

Implement: habitat-driven phenotype weights, early morphology variation, behavioral variation, environmental modifiers, molt trigger, phenotype persistence.

Goal: two users begin producing visibly different SPECs.

### PHASE 7 — HIDDEN WORLD + INCIDENTS

Implement: digital substrate visual layer, cracks / portals, disappearance, hidden-world transitions, rare events, habitat mutations, true-form ambiguity.

Goal: introduce mystery and viral-event potential.

## 35. NEGATIVE CONSTRAINTS

Do not turn SPECIMEN into: a chat widget, Clippy, BonziBuddy, a productivity coach, a desktop Tamagotchi, a notification manager, a generic animated mascot, a conventional game HUD, a crypto/metaverse product, an XP grind, a skin marketplace, a chatbot with legs.

Do not use excessive UI.
Do not cover the desktop with dashboards.
Do not expose internal stats by default.
Do not make SPEC constantly talk.
Do not make every action dramatic.
Do not give the user direct control over evolution.
Do not make phenotype changes simple color swaps.
Do not allow SPEC to damage or modify real user data.

## 36. VISUAL UI CONSTRAINTS

Normal user-facing UI should remain minimal.

Avoid: giant rounded cards, generic AI dashboards, glowing sidebars, unnecessary badges, excessive pills, oversized menus, gamified stat panels.

The organism is the interface.
Traditional UI exists only where required for: settings, permissions, privacy, performance, accessibility, save/reset controls.

## 37. PRIVACY INTERFACE

Users must be able to clearly understand what SPEC can observe.
Include a simple permissions / senses panel.

Example conceptual model — SPEC can currently sense: active applications, browser layout, screen geometry, cursor movement, content categories.

Every permission must be independently understandable and revocable.
Permissions may optionally have organism-themed visual presentation, but clarity takes priority over lore.

## 38. SAVE STATE

SPEC's accumulated history is valuable. Persist: organism age, phenotype weights, personality seed, learned routines, adaptation values, memory scars, habitat state, morphology state, observed user-pattern abstractions, incident history.

Never store sensitive raw content merely because it appeared on screen. Prefer abstractions.

For example store `READING_ACTIVITY_HIGH` rather than storing the contents of every article.

## 39. RESET

Resetting SPEC must require explicit user action.
Clearly explain that resetting destroys accumulated organism history.
Do not use manipulative pressure.
The emotional value should come naturally from persistence.

## 40. V1 SUCCESS CRITERIA

SPECIMEN V1 succeeds if testers independently describe experiences similar to:

"SPEC feels like it lives on my computer."
"It reacts to stuff in a way that surprised me."
"It started learning my routine."
"My SPEC behaves differently now than when I installed it."
"I caught it doing something weird."
"I don't completely understand what it's doing."
"I would be annoyed if I lost this SPEC and had to restart."

## 41. TECHNICAL ACCEPTANCE TESTS

### Desktop

SPEC renders correctly across common Windows scaling settings.
Overlay does not block normal desktop interaction.
SPEC can traverse screen regions without escaping coordinate bounds.
Window movement does not crash navigation.
SPEC can hide behind and emerge around windows convincingly.

### Browser

Extension communicates geometry reliably.
Scrolling updates usable surfaces.
Page navigation does not leave stale collision geometry.
Browser restarts recover safely.
Unsupported pages degrade gracefully.

### Memory

Restarting the machine preserves organism history.
Routine-learning state persists.
Phenotype state persists.
No sensitive raw content is unnecessarily stored.

### Evolution

Simulated activity changes phenotype pressure.
Different simulated user profiles produce meaningfully different outcomes.
Changes are not merely color swaps.

### Performance

Idle usage remains low.
Long-running sessions do not continuously increase memory consumption.
Browser integration does not noticeably degrade normal browsing.

### Safety

SPEC cannot delete files.
SPEC cannot modify actual browser content.
SPEC cannot read password fields.
SPEC cannot silently transmit personal context.
Fake destructive interactions never alter real user state.

### DEV Console

Developer can force every major behavior.
Developer can simulate long-term use.
Developer can preview major phenotype states.
Developer can trigger incidents.
Developer can inspect internal state.
Developer can replay recorded behavior sequences.

## 42. FIRST BUILD TARGET

Do NOT begin by implementing AI memory, evolution, or INCIDENTS.

The first playable technical milestone is: SPEC exists convincingly on the Windows desktop.

The first prototype must demonstrate:

1. transparent overlay
2. click passthrough
3. SPEC idle animation
4. biological crawl
5. cursor tracking
6. walking along bottom screen edge
7. climbing one detected window edge
8. hiding behind that window
9. emerging from the opposite side
10. stable performance

If this does not already feel compelling, do not add intelligence to compensate.
Fix the creature.

## 43. BUILD PHILOSOPHY

Every feature should reinforce at least one of four pillars:

HABITAT — SPEC physically inhabits the computer.
ADAPTATION — SPEC changes because of the environment.
MEMORY — SPEC's history matters.
MYSTERY — the user never fully understands SPEC.

If a proposed feature strengthens none of these pillars, it is probably scope creep.

## 44. FINAL PRODUCT RULE

The ideal SPECIMEN experience is not "Look what this AI can do."

It is "I don't know why mine does this."

Build toward that feeling.
