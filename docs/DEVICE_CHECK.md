# Phone controller acceptance checks

Run the demo checks first. Paid tests require a budget you have chosen and a locally configured API key. Record the real phone model and Chrome version here after inspection; both are unverified.

## Demo / no charges

1. Start `npm start` on the Pi, pair the Pi browser, send a typed message, and check that the response says Demo. Change all four controls, reload, and confirm that the values and conversation return.
2. Connect the phone through its Tailscale HTTPS address. Confirm the screen has all four current values, central conversation, and mirrored edge buttons. Try both natural screen orientations; no horizontal scrolling, hidden Send button, or overlap should prevent use.
3. In Device check, enable microphone and tilt. Confirm both show ready/responding. Deny permission once to verify the error and typing fallback, then allow it in Chrome site settings.
4. Hold Adjust at a comfortable posture. Tilt left/right through positions 1–5, release, and move/put down the phone. The value must remain fixed after release. Repeat at a different posture and after rotating the display. If the physical direction feels inverted in landscape, record the orientation and beta/gamma mapping for adjustment.
5. Hold left Talk and right Adjust simultaneously. Speak while changing the selected dial, then release Talk. A demo voice turn should appear automatically with the release-time settings. Repeat using the opposite thumbs.
6. Hold Talk for less than a moment: no empty turn should be submitted. Background the browser while holding Talk: recording should cancel. Re-enable microphone after returning. Verify releasing Adjust outside its button does not leave tilt active.
7. Send a typed turn and change a dial while the demo reply is waiting. The pending-settings notice should appear. Settings used under that reply must match the older snapshot; the next turn uses the new value.
8. Create a second conversation, switch between them, export one, stop/restart the Pi app, and reload. Both conversations and their own controls should persist. Test a disconnect during a pending turn, then reconnect: the app should fetch its status without resending it.
9. With a delayed connection, send a typed message and begin editing the compose field before the acknowledgment arrives. The new draft must survive. Repeat Talk/Adjust with continued tilting after releasing Talk: Settings used must show the release-time value while the dial retains its newer position.

## Paid smoke test, within the approved total

1. Configure live mode locally; start at Medium effort. Send: “Reply with one short sentence confirming you can read this.” Verify a real answer, `gpt-6.1-sol` live label, and accounted usage. If model access fails, retain the failure and resolve access rather than silently substituting a model.
2. Hold Talk and say: “Please repeat these words: purple teapot, green moon.” Release. Confirm an actual transcript appears automatically followed by a text reply, without a review step or spoken output.
3. Ask a neutral calibration question such as “Help me invent a clock for a room with no windows.” Change one control at a time, keeping the other three fixed. Compare conventional/ridiculous, supportive/adversarial, and feel-around/make-it-happen. Use separate conversations for clean comparisons; keep the total within the budget. Judge the meaningful stance and output, not whether it repeats the setting names.
4. Only if sufficient budget remains, try the other effort positions with a short task and verify their snapshots. Record errors or incomplete outputs. Higher effort can consume more of the fixed output allowance.

## Build-session evidence

- Offline automated checks: passing (see `npm test`).
- Proposal integrity: original SHA-256 verified by `npm run check`.
- Paid API calls: none made during implementation; budget approval pending at time of writing.
- Socket/server/browser tests: unavailable in assistant sandbox (`EPERM`, including Chromium socket creation).
- Real phone, HTTPS, microphone, motion, simultaneous touches, API access, and behavioral calibration: not yet verified.

## October 9 review and bug-fix evidence

- All 24 offline tests pass, including eight browser event cases using the actual app code with substituted DOM, audio, and network boundaries. Delayed acknowledgment draft loss and post-release voice snapshot drift were reproduced before their fixes.
- Syntax and original proposal integrity checks pass.
- The review started an isolated demo server and passed a real loopback HTTP smoke test. The earlier socket restriction no longer applied to that session.
- Collaborative browser navigation failed with `ERR_CONNECTION_REFUSED`; rendering and the real-device checks above remain outstanding. No paid API calls were made.
