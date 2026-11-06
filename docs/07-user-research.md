# 07 — User research

Goal: validate the **personas** and **product hypotheses** before investing heavily in the overlay and host mode, and later test the overlay's usability.

## 1. Research plan

### Research questions
1. In what situations do people share their screen with friends or colleagues today, and with which tool?
2. What bothers them about those tools while using them (window taking up space, focus switching, screen audio, quality)?
3. How much does an always-visible overlay help or get in the way? Where should it sit and what does it need to show?
4. Who would be willing to **host** the server? What stops that person (network, router, PC left on)?
5. Is audio from just one app something people ask for spontaneously, or do they only value it when shown?

### Hypotheses to test
| ID | Hypothesis | Confirmation signal |
|---|---|---|
| H1 | Gamers keep the game in a borderless window (the overlay works) | ≥ 4 of 6 play this way or would accept it |
| H2 | Seeing avatar + name + who speaks is enough in the overlay; controls can hide behind a click | No participant asks for always-visible controls in the test |
| H3 | Sharing an app with its own sound is a perceived differentiator | Mentioned as a pain spontaneously or rated ≥ 4/5 |
| H4 | The host accepts using a mesh VPN if the app guides them | ≥ half of potential hosts accept |
| H5 | A Discord-style palette and layout reduce the learning curve | Main-window tasks completed without help |

### Methods and schedule
| Step | Method | Sample | When |
|---|---|---|---|
| A | Semi-structured interviews | 5–8 (mix of gamers, students and would-be hosts) | Alongside Phase 0 |
| B | Usability test with a clickable overlay prototype (Figma or the Phase 3 app itself) | 5–8 | End of Phase 3 |
| C | Field test (closed beta): a group uses it for a week, with a mini diary | 1–2 groups of 3–5 | Phase 6 |
| D | Short post-beta questionnaire (SUS + 3 open questions) | all testers | Phase 6 |

**Recruiting:** college classmates (class and study groups), friends who play together and gaming communities. Criterion: shared their screen with someone at least once in the last month.

**Ethics:** ask for consent to record; anonymize in the notes ("P1", "P2"…).

## 2. Interview script (≈ 50 min)

**Warm-up (5 min)**
- Introduction, goal ("understand how you use calls and screen sharing, not test you"), consent to record.
- What do you usually do on the computer with other people at the same time?

**Context (10 min)**
- Tell me about the last time you shared your screen with someone. What were you doing? Which app did you use?
- What was on the screen: a game, a browser, code? Full screen or windowed?
- Who else was on the call? How long did it last?

**Going deeper (20 min)**
- What went wrong or bothered you that time? *(probe: audio, quality, finding the right window, echo, the call window getting in the way)*
- When you're playing or focused, how do you know who is speaking? Do you need to look at the call?
- Have you ever needed to share the sound of what you were showing? How did you do it? Did it work?
- Have you ever accidentally shown something you didn't want to (a notification, another window)?
- *(potential host)* Would you leave a server running on your PC for the group? What would stop you? Have you ever messed with a router or a VPN?

**Reaction (10 min)**: show a mock of the overlay (compact and expanded) and the screen picker.
- What do you understand this is? What would you click first?
- Where on the screen would you put it? What would you remove or add?
- From 1 to 5, how much would "share just one app with its own sound" change how you use it? Why?

**Wrap-up (5 min)**
- Is there something I didn't ask that matters to you?
- Would you be up for testing a beta? Thank them.

## 3. Overlay usability test script

**Setup:** the app (or prototype) with the overlay active, a game/video in a borderless window and 2 fake participants (one speaking, one streaming).

| # | Task | Success |
|---|---|---|
| T1 | "Find out who is speaking right now." | Identifies them by the green ring in ≤ 5 s |
| T2 | "Mute your microphone." | Expands the overlay and mutes, or uses the shortcut, without help |
| T3 | "Hide the overlay and then bring it back." | Collapses and reopens it |
| T4 | "Move the overlay to the other side of the screen." | Drags it by the handle |
| T5 | "Share only the game window, with its sound." | Opens the picker, Apps tab, picks the window, leaves audio on, goes live (≤ 3 clicks after "Share") |
| T6 | "Watch the screen Ana is streaming and make it full screen." | Clicks LIVE → viewer → full screen |
| T7 | "Lower only Bruno's volume." | Right-click → slider |

**Measure:** success/failure, time, errors, think-aloud and SEQ (ease from 1 to 7) after each task.

## 4. Synthesis

- **Affinity map:** each observation on a card (FigJam/Whiteboard), grouped into themes (overlay, audio, host, quality, trust).
- **Impact × effort matrix** to prioritize what goes into the MVP and what goes to the backlog.
- **Journey:** "decide to play/study together → join → talk → show the screen → wrap up", marking the pain points.
- **JTBD:** "When I'm [playing/studying] with my group, I want to [talk and show what I see without leaving what I'm doing], so that [I stay focused and the conversation flows]."

**Deliverables:** a synthesis report (themes, insights, recommendations) + a highlight reel with quotes. With the transcripts, the `research-synthesis` skill can put the report together.
