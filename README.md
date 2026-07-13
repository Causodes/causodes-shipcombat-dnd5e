# Causodes's Ship Combat (D&D 5e)

![![Watch the Video Showcase!](https://github.com/user-attachments/assets/1835301a-cb39-44c4-afbf-5318cdd488f2)](https://github.com/user-attachments/assets/834ba738-a547-4032-935c-dde5c44d3c8c)

A FoundryVTT module for **D&D 5e** that adds a full ship combat system. Up to six players each claim a named bridge station and execute their role's mechanics from a dedicated tab on the shared starship sheet. The crew size is adjustable; roles collapse and merge as headcount drops. All players take their turns simultaneously on the player ship's turn in the combat tracker.

See the role-specific reference documents for full details on what each station does:

- [README_3.md](README_3.md) — 3-player crew
- [README_4.md](README_4.md) — 4-player crew
- [README_5.md](README_5.md) — 5-player crew
- [README_6.md](README_6.md) — 6-player crew

For help with first time setup, please see [TUTORIAL.md](TUTORIAL.md)!

---

## Dependencies

- **Causodes's Ship Combat (Core)** — the system-agnostic engine module
- socketlib
- **D&D 5e** system (dnd5e)

**Optional (for combat animations):**
- Sequencer
- JB2A Patreon (Jules and Ben's Animated Assets — Patreon version required for the full animation set)

---

## Actor Types

The module registers three actor types, but the Create Actor dialog shows a single **Starship** entry. Picking it opens a follow-up prompt to choose which kind of starship actor to create:

| Choice | Actor Type | Sheet |
|--------|-----------|-------|
| Player Starship | `ship` | Full six-station bridge sheet |
| NPC Starship | `npcShip` | Compact GM-only sheet (Overview / Movement / Weapons / Ordnance tabs) |
| Ordnance | `shipOrdnance` | Torpedo / strike craft stat block (subtype set on its Configuration tab) |

A **Ship Component** item type carries all installable hardware (weapons, armor, engines, sensors, reactors, shields, ordnance bays).

---

## The Ship Sheet

Each player sees only their own station tab. The GM sees all tabs simultaneously. Players with full ownership of the actor can additionally see the Configuration tab.

### Sidebar

The Sidebar shows the ship's damage **Resistances, Immunities, Vulnerabilities, and Damage Modification** (edited via the native dnd5e trait configs — see *Damage Types* below), plus vehicle details: travel speed/pace, cost, weight, keel, beam, cargo capacity, and crew/passenger counts.

### Overview Tab

Players can view and claim roles as well as view and equip various ship components on this tab. The "Ready" column on the Bridge Crew table indicates the status of the role; players who have marked their turn as "Done" will have the status update to "Yes". Once all roles are ready, the GM can advance the turn in the combat tracker.

GMs can manually override the name of a role as well as change the skill associated with a given role from this tab by editing the fields under the Bridge Crew table.

### Default Role Skills

| Role | Default D&D 5e Skill |
|------|---------------------|
| Captain | Persuasion |
| Engineer | Arcana |
| Pilot | Acrobatics |
| Sensors Officer | Perception |
| Gunner | Sleight of Hand |
| Ordnance Officer | Athletics |

All role skills can be remapped per ship from the Overview tab. Rolls go through the native dnd5e skill-check dialog, so advantage/disadvantage and situational bonuses apply normally.

---

## Configuration Tab

The Configuration tab is where role count, weapon configuration, and the ship component inventory is managed. It is only accessible to players with Owner-level permission and to the GM.

### Ship Configuration

| Setting | Values | Notes |
|---------|--------|-------|
| Active Roles | 3 – 6 | Number of active player stations; see crew reference READMEs for per-size layouts |
| Strike Craft | Yes / No | Show or hide the Strike Craft ordnance column and actor template drop target |
| Movement | Simplified / Realistic | Helm movement model. **Simplified** uses fixed-radius arcs and immediate bearing changes. **Realistic** uses Newtonian vector physics with persistent momentum. |

### Torpedo / Strike Craft Launch Directions

Pill toggles for each direction (Bow, Port, Starboard, Stern) control which sides are valid launch origins for torpedoes and strike craft. At least one direction must be active; if all are deselected for a type the launch action returns an error.

### Hull Points

**Maximum hull points are set directly on the ship actor** — they are the only stat not derived from a component. Click the cog on the HP bar in the sheet header to open the Hit Points configuration. The HP meter follows the standard 5e convention: the value shown is hull points *remaining*.

### Weapon Slots

Set the slot count for each weapon position. Only positions with at least one slot are shown in the active station tabs.

| Position | Notes |
|----------|-------|
| Prow | Forward-facing fixed mount |
| Dorsal | Forward-facing fixed mount |
| Port | Port broadside |
| Starboard | Starboard broadside |
| Stern | Rear-facing fixed mount |
| Ordnance | Number of simultaneously loadable ordnance bays |

### Equipment Slots (Component Inventory)

All ship stats other than hull max are derived from installed **Ship Component** items. Only components with the equipped flag active are read.

| Slot | Drives |
|------|--------|
| Shields | Max flux, sector zone thresholds, Flux-to-AP ratio |
| Armor | Armor value per sector (Bow, Stern, Port, Starboard), Armor portion of the ship's **AC** |
| Engine | Base speed, base maneuverability, Auxiliary Power conversion rate, Engine portion of the ship's **AC** |
| Sensor Array | Hit Modifier (weapon accuracy bonus), band size (accuracy decay), auto-scan range, max detection range, AP cost ratio |
| Reactor Core | Core output, heat capacity, Auxiliary Power capacity, shield flux per core, Auxiliary Power reserve multiplier, **Overclock Base DC** |
| Ordnance Bay | Torpedo salvo size, strike craft flight size, available payload count, manpower |

Only one component per equipment slot type is active at a time; switching the dropdown unequips the previous one.

Weapon components use structured 5e damage: **dice count × die size + flat bonus**, plus a **damage type** chosen from the standard 5e damage types (see *Damage Types* below).

### Ordnance Actor Templates

Torpedoes and strike craft use the **Ordnance** actor type and are initialized outside the ship sheet. They are registered as launch templates by dragging them into the two drop targets on the Config tab; once registered, the original actor can be deleted:

- **Torpedo Actors** — drag one or more torpedo actors here; the Ordnance Master selects which type to arm/launch each round depending on how many are equipped on the **Overview** tab.
- **Strike Craft Actors** — drag one or more strike craft actors here; same selection logic

Each template actor carries all stats for that ordnance type: speed, maneuverability, fuel, warhead damage, damage type, and blast radius (torpedoes), hull, sensor rating, weapon load (strike craft). When a torpedo or flight is launched, a new token is spawned on the canvas using the template actor's stats. The original template actor is never modified during play.

Leave the hull of an ordnance actor template at **1/1**; on launch it is multiplied by the Ordnance Bay's salvo/flight size. Upon taking damage from any source, an ordnance token loses exactly 1 hull point; multiple hits from a salvo deduct multiple points.

---

## Points Allocation

Several station roles (Captain, Pilot, Gunner, Ordnance Master) earn **action points** each round by rolling their primary skill check against **DC 10**. The number of points awarded is determined by the roll total:

| Roll Total | Points Awarded |
|-----------|----------------|
| ≤ 9       | 0              |
| 10 – 14   | 1              |
| 15 – 19   | 2              |
| 20 – 24   | 3              |
| 25 – 29   | 4              |
| *(+5 per tier)* | *(+1 per tier)* |

### Natural 20 and Natural 1

- **Natural 20** (die face = 20): the points awarded are increased by **+1**, on top of the table result.
- **Natural 1** (die face = 1): **automatic failure** — 0 points regardless of the total.

The chat card shows the table with the active row highlighted at the roll-total position, a "Natural 20: +1 Point" or "Natural 1: Automatic Failure" note when applicable, and the final adjusted **→ Points Granted** count.

---

## Movement

Two movement models are available, selectable in the Configuration tab.

### Simplified Movement

The ship travels in a fixed-radius arc anchored to the current heading. The Helmsman sets a bearing (port or starboard, up to Maneuverability × 15°) and a power level; the ship arcs that many degrees and travels the corresponding distance. Minimum move is enforced: the ship must travel at least half the distance it moved last turn, represented by the yellow marker on the Thrust slider.

### Realistic Movement (Newtonian)

The ship has a persistent **velocity vector** carried between turns. Each helm activation adds thrust along the new heading on top of that residual momentum. The interplay of momentum and thrust determines where the ship actually ends up.

#### Helm Controls

| Control | Description |
|---------|-------------|
| **Bearing** | Port/starboard heading change, in degrees. Capped to Maneuverability × 15° per turn (the **Bearing Adjustments** bar tracks remaining budget). |
| **Thrust** | Power committed to the drives. |
| **Momentum** | Percentage of last turn's velocity to carry into this manoeuvre. Remaining momentum auto-drifts at turn end. |

#### Velocity Display

The Min. Move indicator in the header row shows the current momentum vector on hover. Click the compass icon to toggle between **relative** bearing (degrees off the ship's nose) and **true** bearing (compass north = 0°).

### Ramming

The **Ram Target** button (both modes) becomes active when at least one visible target is reachable within the current bearing arc and remaining power. Hovering a row in the popup previews the ram arc; clicking **Ram** commits all remaining power.

**Physics on impact:**
- The rammed ship is displaced in the direction of impact and receives hull damage bypassing shields and armor.
- The ramming ship receives hull damage in return.
- **Realistic mode:** The ramming ship retains 20% of its velocity vector; the rammed ship inherits 50% of the ramming ship's velocity.
- **Simplified mode:** The ramming ship rotates ±20° randomly to simulate the impact jolt.
- In both modes a crit roll is made for each ship.
- **Damage formula** (both modes): `(bowArmor + 0.25 × hullMax) × thrustFraction × angleMod × 2`. The ramming ship's incoming damage is reduced by its bow armor.
- Ram damage is **bludgeoning**: each ship's immunities, resistances, and vulnerabilities apply to the collision damage it receives.
- After a ram the helm is locked for the remainder of the turn: Thrust slider, prow weapons, and bow ordnance launches are all disabled.

---

## Shields, Armor, and AC

The angle of incoming damage is calculated and assigned to the appropriate sector that is hit (Bow, Stern, Port, Starboard).

For every point of active shield, 1 incoming hit is fully nullified, regardless of damage. Shields can be **overcharged** above the sector's maximum (shown in blue on the sheet header); however, any shields over the maximum are lost at the start of the following turn.

Armor negates 1 point of damage per point of sector armor.

Weapon attacks roll **1d20 + modifiers** against the target's **AC** to determine hits. A ship's AC is the sum of the AC contributions of its equipped Armor and Engine components. A **natural 20 always hits; a natural 1 always misses**. Each point of the Pilot's Evasion allocation imposes −1 on all incoming attack rolls (equivalent to +1 AC) for the round.

---

## Damage Types, Immunities, Resistances, and Vulnerabilities

Ship weapons and ordnance payloads carry a standard **5e damage type** (fire, piercing, force, …). Ship actors expose the native dnd5e trait sets — **Damage Immunities, Resistances, Vulnerabilities, and Damage Modification** — edited from the sidebar cog buttons exactly like a regular NPC.

Incoming hull damage is modified per the standard 5e rules, in the standard order:

1. **Immunity** — the damage becomes 0. Immune attacks also drain **no shields**.
2. **Damage Modification** — flat per-type (and "ALL") formula amounts, added before halving/doubling.
3. **Resistance** — damage halved (rounded down).
4. **Vulnerability** — damage doubled.

This applies to direct weapon fire, torpedo detonations, strike-craft attack runs, and ramming (bludgeoning). Weakness/resistance is applied to the pre-armor damage of each hit; sector armor is subtracted afterwards.

---

## Internal Fire

Deals passive hull damage each round and reduces available manpower.

---

## Critical Hits

- A shot is a **critical hit on a natural 20** (which also always hits). There are no margin-based crits in 5e.
- Each critting shot adds the weapon's **Devastating** value as bonus damage (tripled while Overcharged).
- After the salvo resolves, if net hull damage got through, **one crit roll** is made against the target:
  - **Severity**: if the total hull damage exceeded **10% of the target's maximum hull**, a d10 sets the tier (Low/Medium/High); otherwise the crit is guaranteed **Low** tier.
  - **Location**: d6 (or the Gunner's choice with **Directed Fire** active).
- **Fire for Effect** (sensors BDA correction): each Point expands the natural crit range by 1 (2 Points → crit on 18–20) *and* lowers the 10% severity threshold by 1 percentage point.
- **Devastation Protocol** (captain stance): every attack that deals net hull damage rolls the full d10 severity die, regardless of the damage threshold.

Crits landing on an already-damaged location trigger an escalation roll: 4+ on a d6 steps it up one tier; a High-tier location that would escalate further deals −3 hull damage instead.

| Location | Low | Medium | High |
|----------|-----|--------|------|
| Hull | +1 hull damage/round | +2 hull damage/round | +3 hull damage/round + +5 internal fire/round |
| Engines | –1 Speed | –2 Speed | –4 Speed |
| Manoeuvring Thrusters | –1 Maneuverability | –2 Maneuverability | –4 Maneuverability |
| Core Systems | Core distribution disabled | Core distribution disabled + 5 heat/round | Core distribution disabled + 5 heat/round + AP generation disabled |
| Weapons & Sensors | One weapon section disabled | One weapon section disabled + sensor offline (lock upgrades blocked, radar hidden) | All weapons penalised to hit + one weapon section disabled + sensor offline |

Condition step-down (damage control) costs 10% of maximum Auxiliary Power per action. The same location can be stepped down multiple times in the same turn as long as AP and repair actions remain.

---

## Ordnance

### Torpedoes

Torpedo tokens are manually controlled by the owning player. Each torpedo has hull (warhead count), speed, maneuverability, and fuel. They must be moved each round; the controlling player issues helm orders. On detonation, the warhead deals area damage falling off with distance from the blast centre, multiplied by the number of intact warhead sections (hull integrity). All ships, torpedoes, and strike craft within the blast radius are affected regardless of allegiance. The payload's damage type is checked against each ship target's immunities, resistances, and vulnerabilities.

The turn a torpedo is launched it drifts automatically and cannot be given orders — it acts normally from the following round.

### Strike Craft

Strike craft flight tokens are manually controlled. Each flight has hull, fuel, a sensor rating, and an optional weapon. Fighters make attack runs against ships, other craft, or torpedoes; bombers attack ships only. Attack-run damage against ships respects the payload's damage type (immunities, resistances, vulnerabilities). Flights that run out of fuel before returning to the mothership are lost.

---

## Weapon Traits

| Trait | Effect |
|-------|--------|
| Shield Bypass | Hits ignore shields entirely |
| Multiple Attacks | Able to fire an infinite amount of times per turn, as resources permit |
| Shield Burn | Each hit absorbed by shields drains additional flux |
| Rend | Each hit permanently reduces sector armor regardless of hull damage dealt |
| Armor Penetration | Reduces effective sector armor per hit |
| Devastating | Adds this value as bonus damage on each critical (natural 20) hit |
| Unreliable | A shot that rolls a **natural 1** jams the weapon and **halts the entire salvo** |
| Overcharge | Heat weapons only. When fired overcharged: 2 heat per shot, triple weapon trait values |
| Hit Rating | Flat bonus or penalty to base hit chance for all shots |

---

## NPC Ships

NPC ships use a separate actor type with simplified GM-only controls across four tabs — Overview (PIL/ENG/GUN stats, action buttons, shield allocation compass, conditions), Movement (helm control), Weapons (batteries + gunnery allocation), and Ordnance (loadouts and deployed ordnance). Per-sector **armor current | max** is edited directly in the sheet header. NPC skill checks roll `1d20 + attribute`.

---

## Module Settings

| Setting | Description |
|---------|-------------|
| Contact Designation | Label style for unidentified Sensor blips: Greek letters, numeric, or naval callsigns |
| Sweep-Gated Radar Positions | Blip positions only update when the radar sweep arm passes over them |
| Movement Mode | Simplified fixed-radius arcs or Realistic Newtonian vector physics |
