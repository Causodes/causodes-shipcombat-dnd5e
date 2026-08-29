## v1.1.1
- Default NPC and Ordnance actors to unlinked tokens
- Bump verified version to 14.367
- Restore minimum verified version to v13

## v1.1.0
- Apply hostile and hidden token defaults when the Starship creation prompt or legacy migration retypes a player ship as an NPC ship, preventing enemy ships from appearing as untargetable friendly Lock 4 contacts
- Update crew-layout guides for shared receiving-operator Power Core pools and separate shield/Auxiliary Power commitments
- Define D&D5e's singular `point` and plural `points` allocation terminology once in the system adapter and consume it across localized and generated UI copy
- Convert legacy percentile fire-mode modifiers to d20 bonuses, use +1 per allocated Gunnery Point, and remove percentile-only accuracy copy
- Apply Captain initiative allocation as a reversible combat-tracker bonus, replacing the previous Ship Combat bonus at each round transition without carrying a rolled baseline between combats
- Replace remaining inherited and dynamically generated “SL” descriptions with “points” terminology
- Update Resolve copy for the base mulligan plus per-point bonus; the shared Core Captain layout no longer repeats Active Standing Orders below the tab

## v1.0.4
- Validate and upload `module.json` directly from the release tag so published manifest assets cannot advertise an older module version or download URL
- Bump release version to fix mismatched module.json and enforce a fresh pull from FoundryVTT package manager

## v1.0.3
- Fix NPC Ship Hit Point edits being discarded: the D&D5e HP configuration popup now writes current and maximum HP to the ship's authoritative hull values
- Make NPC Ship Armor Class a persistent, manually configured flat value; equipped armor and engine components no longer overwrite NPC AC
- Remove legacy D&D5e palette and the broken relative `parchment.jpg` request
- With Ship Combat Core v2.2.3, restore player-ship weapon firing-arc and range overlays for 4- and 5-person crew layouts and prevent overlapping targeting popups from producing positioning errors

## v1.0.2
- Backwards compatibility for v13

## v1.0.1
- Small UI improvements

## v1.0.0
- Initial v14 release
