# Physical objects as thinking partners and moves

Design notes for a possible extension: physical objects that change how the AI approaches the work. None of this is implemented yet.

## The idea

Use physical objects identified by NFC or RFID (cards, 3D models, figurines) with an interaction reminiscent of Nintendo's amiibo. Bringing an object into the interaction changes how the AI approaches the work.

Examples:

- **A 3D model of your boss:** your boss is reviewing what you are doing.
- **A figurine of a persona**, such as an influencer or a contemplative teacher: approach the project through that lens. These parallel the app's on-screen modes.
- **Models of conceptual approaches:** objects can embody a thinking move as well as a person.
- **Fireworks:** explore wild ideas.
- **Scissors:** cut down whatever you are working on, whether that's length, scope, complexity or cost.

This expands the original proposal's tagged perspective/project cards into a broader vocabulary of tangible people, metaphors and conceptual approaches.

## On-screen feedback

When a physical object is placed on a reader, a small 3D representation of it appears on screen, showing that it is active. The screen mirrors the objects currently taking part in the conversation. When an object is removed, its representation either disappears or is shown as inactive. A static image and an animated 3D model are both possible.

With several readers, the screen shows all active objects together. Whether an object is present must stay separate from whether its instructions have applied to a reply already in progress, because changes apply on the next turn.

## Possibilities to explore

- **A little stage:** place a character on it to give that perspective the floor. A boss profile could be based on the user's description of their boss's priorities.
- **A workshop of thinking tools:** scissors trim, a magnifying glass examines an assumption, a bridge connects distant ideas, a seed develops a small promising detail, and a wrecking ball challenges the structure.
- **Combinations:** a character plus a tool means that perspective performs that move. A boss plus scissors asks what that boss would cut. Fireworks plus a seed develops one outrageous possibility.
- **An audience or council:** several characters respond separately, then compare their disagreements. This exposes competing priorities without blending everyone into one generic voice.
- **A journey across places:** marked areas such as Imagine, Build and Test change what an object asks the system to do. Placement becomes part of the meaning.
- **A mystery object:** invite an unexpected thinking move, then reveal its meaning on screen. It's unclear whether the surprise helps discovery or makes the instrument harder to understand.

## Possible integration with the app

The app stores four persistent controls and a mode for each conversation, and takes a snapshot of them for each submitted turn. `public/controls.js` and `public/modes.js` compose behavioral instructions. `src/pilot.js` takes the turn snapshot, `src/provider.js` builds the model request, and `src/store.js` persists conversations and turns.

A possible extension:

1. Maintain an object catalog: object ID, visible name, meaning, and whether it selects a perspective, a persistent approach or a one-time move.
2. Let a reader event and an on-screen selection trigger the same action. On-screen selection allows the interaction to be explored before any hardware exists.
3. Store active perspectives and approaches alongside the conversation's controls. Keep one-time moves separate from persistent state.
4. Show the active objects and their effects on screen. Include the applied object definitions in each turn's snapshot so old results remain understandable if definitions change.
5. Combine the object's instructions with the four controls for the next model request. Steering a reply that is already in progress is a separate design question.

Objects and controls need a defined relationship. Fireworks might set the existing wildness dial, temporarily override it, or request one burst of wild alternatives, and each feels different. A person or perspective can add something independent of the four controls.

## Open interaction questions

- Does tapping an object select a lasting state, request a single move, or both depending on the object?
- Does placing an object keep it active until removed? A tap alone doesn't establish ongoing presence. Placement, removal and multiple objects depend on the reader.
- Do multiple objects combine, take turns or replace one another?
- What does an object act on: the conversation, the latest answer, a selected passage or a saved artifact?
- How does the user undo or clear an object's effect?
- How are personal perspectives written and refined so they reflect the lens the user intends?

## Tap versus place

There are two possible experiences:

- **Tap to join/leave:** scan the boss and its on-screen figure joins the conversation, and scan again to dismiss it. Provide an on-screen dismiss button too. One reader can activate several objects in sequence. Repeated reads from one tap must count as a single interaction.
- **Place to stay:** a marked pedestal keeps an object active while it's present. With suitable reader and software support, repeated presence checks and a short grace period can detect removal. A pedestal could also combine NFC identification with a separate occupancy sensor, since occupancy alone doesn't identify the object.

A good first experiment is tap to join/leave with visible on-screen figures and labels for their effects. The pedestal can be compared later for how it feels.

The [Adafruit PN532 API](https://docs.circuitpython.org/projects/pn532/en/latest/api.html) exposes timed passive-target reads, which is one building block for polling. Reliable removal detection needs testing on the actual reader.

## Readers and range

NFC is part of the wider RFID family. HF vicinity systems (ISO 15693 / NFC-V) and UHF/RAIN RFID are distinct options, and not all tags and readers interoperate. [ST's NFC/RFID overview](https://www.st.com/en/applications/connectivity/nfc-rfid.html) covers the HF standards. [Impinj's RFID overview](https://www.impinj.com/products/technology/about-rfid) describes RAIN ranges from centimeters to several meters and reading multiple tagged items at once.

A marked "thinking arena" containing the active objects is possible, but a longer reading range doesn't on its own give a precise arena boundary or reliable removal detection. Antenna layout, tag orientation, nearby objects, repeated inventory checks and a grace period all need testing. An unread tag shouldn't immediately be treated as deliberately removed.

**Desktop USB readers.** PC/SC readers with ISO 15693 (NFC Type 5) support are a practical starting point on Linux and macOS. Examples include the ACS [ACR1552U](https://www.acs.com.hk/en/products/617/acr1552u-usb-nfc-reader-iv/) and the slimmer ACS ACR1555U (USB-C and Bluetooth).

- Plan ordinary PC/SC use as one card at a time, not an automatic list of every object present.
- The ACR1552U reference manual lists ISO 15693 Inventory and Stay Quiet pass-through commands. That suggests a possible custom path for reading several tags at once, but it hasn't been tested.
- ACS's [utility documentation](https://www.acs.com.hk/en/utility-tools/) describes presence/absence monitoring for its PC/SC readers, including on Linux. That supports a place-to-activate, lift-to-deactivate station without a second tap. The app would have to monitor and record those transitions itself. Use reader/writer (PC/SC) mode rather than keyboard-emulated tag IDs, and add a short grace period to prevent flicker.
- Several separate readers, one per spot, are a simple way to support multiple objects. Visually distinct readers make them easy to tell apart.

**Cheap "mats".** Commercial RFID mats are expensive. A cheap prototype can put one reader under one marked spot in thin cardboard or another nonmetallic surface, after checking that it reads through. That makes one active spot, not a surface that locates arbitrary objects. A DIY module such as the PN532 is another building block, but it needs wiring, compatible tags, software and spacing tests.

## Cockpit displays

A later idea is an airplane-cockpit arrangement: several small displays in custom 3D-printed holders, each showing one indicator. Some sit on the desk, and others are separate objects that can be picked up and moved.

Small ESP32 boards with built-in screens suit this. Waveshare, for example, makes round and rectangular touch LCDs, AMOLED panels, and monochrome and four-color e-paper boards ([1.54-inch e-paper](https://docs.waveshare.com/ESP32-S3-ePaper-1.54), [3.97-inch e-paper](https://docs.waveshare.com/ESP32-S3-ePaper-3.97), [1.91-inch AMOLED](https://www.waveshare.com/esp32-s3-amoled-1.91.htm)).

Possible roles:

- **Round LCD:** a single gauge, such as wildness or critique.
- **Rectangular LCD:** listening/thinking/ready status or a level indicator.
- **AMOLED:** a colorful image of the active perspective, or an animated instrument.
- **Small monochrome e-paper:** perspective names, the current mode or short prompts.
- **Four-color e-paper:** a slowly changing character or project badge. Its [documented refresh time](https://docs.waveshare.com/ESP32-S3-ePaper-1.54G) is 15 to 20 seconds, so immediate feedback should use another display.
- **Larger e-paper:** the current question, a working intention or a short text artifact.

One option for holders is removable pods that fit a common mounting system, with access to USB and the programming button. Measure the actual hardware before finalizing holders. Display roles, networking, power and app integration are all open.
