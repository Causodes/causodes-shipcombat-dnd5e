/**
 * Dnd5eAdapter — D&D 5e system adapter for causodes-shipcombat-core.
 *
 * Maps the abstract ship-combat API onto dnd5e: identity/base-class wiring,
 * damage helpers, skill resolution, d20 roll mechanics, and the roll API.
 */

const { SystemAdapter } = globalThis.ShipCombat._api;

// ── Skill map: abstract role key → dnd5e 3-letter skill abbreviation ────────
// Drives resolveSkill() and getDefaultRoleSkillMapping(). The default mapping
// can be overridden per-ship via the role-skill-override dropdown the core
// sheet exposes.
const SKILL_MAP = {
  leadership:  { key: "per" },   // Persuasion       (CHA) — captain
  engineering: { key: "arc" },   // Arcana           (INT) — engineer
  pilot:       { key: "acr" },   // Acrobatics       (DEX) — helm
  sensors:     { key: "prc" },   // Perception       (WIS) — sensors
  ordnance:    { key: "ath" },   // Athletics        (STR) — ordnance
  gunner:      { key: "slt" },   // Sleight of Hand  (DEX) — gunner
  navigation:  { key: "his" },   // History          (INT) — navigation
};

export class Dnd5eAdapter extends SystemAdapter {

  /* ── Identity ───────────────────────────────────────────────────────────── */

  get moduleId()       { return "causodes-shipcombat-dnd5e"; }
  get systemName()     { return "dnd5e"; }
  get englishVariant() { return "american"; }

  /**
   * dnd5e uses the same three ship actor types as the other companions
   * (ship / npcShip / shipOrdnance), so core's default type checks work.
   * @override
   */
  isShipActor(actor) {
    return actor?.type === `${this.moduleId}.ship`;
  }

  /** @override */
  isNpcShipActor(actor) {
    return actor?.type === `${this.moduleId}.npcShip`;
  }

  /* ── Base classes ───────────────────────────────────────────────────────── */

  /**
   * dnd5e is AppV2-native — no AppV1 bridge needed.
   * @override
   */
  get useApplicationV1() { return false; }

  /**
   * Sheet base: NPCActorSheet (inherits play/edit toggle, sidebar collapser,
   * vertical tab strip, inventory chrome, and all BaseActorSheet actions).
   * Falls back to ActorSheetV2 if the dnd5e global hasn't loaded yet (should
   * not happen in practice since configure() is called at module-eval time
   * before "init", but guarded for safety).
   * @override
   */
  get SheetBaseClass() {
    return globalThis.dnd5e?.applications?.actor?.NPCActorSheet
        ?? foundry.applications.sheets.ActorSheetV2;
  }

  /**
   * Item sheet base: ItemSheet5e, inheriting dnd5e item chrome.
   * @override
   */
  get ItemSheetBaseClass() {
    return globalThis.dnd5e?.applications?.item?.ItemSheet5e
        ?? foundry.applications.sheets.ItemSheetV2;
  }

  /**
   * dnd5e TypeDataModel is the standard foundry base — no system wrapper.
   * @override
   */
  get ActorModelBaseClass() { return foundry.abstract.TypeDataModel; }

  /**
   * @override
   */
  get ItemModelBaseClass() { return foundry.abstract.TypeDataModel; }

  /**
   * 5e thinks in terms of HP remaining, not wounds accumulated.
   * Core uses this to interpret hull.value (hpRemaining = value IS the HP
   * left; damageTaken = value is accumulated damage).
   * @override
   */
  get hullDisplayMode() { return "hpRemaining"; }

  /**
   * Inject dnd5e system CSS classes so the ship sheet inherits the dnd5e2
   * theme alongside the ship-combat role colours.
   * @override
   */
  get sheetCSSClasses() { return ["dnd5e2", "npc", "vertical-tabs"]; }

  /* ── Crew eligibility ───────────────────────────────────────────────────── */

  /**
   * Only PCs and NPCs may crew a ship; other special types (vehicles, etc.)
   * may not.
   * @override
   */
  isCrewActorEligible(actor) {
    return actor?.type === "character" || actor?.type === "npc";
  }

  /* ── Targeting ──────────────────────────────────────────────────────────── */

  /**
   * 5e stores AC at actor.system.attributes.ac.value (computed by the system).
   * The pilot's Evasion allocation adds +1 AC per point (mirrors sf2e-adapter);
   * undefined for non-ship actors and harmlessly resolves to 0.
   * @override
   */
  getTargetAC(actor) {
    const baseAC = actor?.system?.attributes?.ac?.value ?? null;
    if (baseAC === null) return null;
    const allocEvasion = actor?.system?.resources?.pilot?.allocEvasion ?? 0;
    return baseAC + allocEvasion;
  }

  /* ── Model stubs ─────────────────────────────────────────────────────────── */

  /**
   * Called during the ship models' prepareBaseData() → computeBase().
   * Stubs out dnd5e NPC-sheet-expected system properties that are NOT part of
   * the ship model schemas but are read by NPCActorSheet template helpers.
   *
   * Runs every prepare cycle so the stubs are always present at render time.
   * @override
   */
  initModelStubs(model) {
    // _prepareAbilities() calls Object.entries(context.system.abilities).
    // An empty object makes it return an empty array with no crash.
    model.abilities = {};

    // _prepareSidebarContext checks this.actor.system.skills.prc.
    // _prepareSkillsTools uses system.skills ?? {} — empty object is safe.
    model.skills = {};

    // NPCActorSheet._prepareHeaderContext destructures resources.legact / legres / lair.
    // ShipSchemaMixin defines resources as an ObjectField (initial {}), so
    // _source.resources is {} and the sub-keys are absent.  Stub them so
    // the sheets' _prepareHeaderContext overrides (which replace the NPC version)
    // can read them without crashing on other code paths.
    const res = model.resources ?? {};
    res.legact ??= { value: 0, max: 0 };
    res.legres ??= { value: 0, max: 0 };
    res.lair   ??= { value: false, initiative: 0 };
    model.resources = res;
  }

  /* ── Damage helpers ─────────────────────────────────────────────────────── */

  /**
   * Return sorted damage-type choices for weapon component sheets.
   * Reads CONFIG.DND5E.damageTypes at call time (safe — called only when a
   * component item sheet is opened, long after the "init" hook).
   * @override
   * @returns {{ value: string, label: string }[]}
   */
  getDamageTypeChoices() {
    const types = CONFIG?.DND5E?.damageTypes ?? {};
    return Object.entries(types)
      .map(([value, cfg]) => ({
        value,
        label: typeof cfg === "string" ? cfg : (cfg.label ?? value),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /**
   * Build the Roll formula string from the structured diceCount / dieSize /
   * bonus fields on ShipComponentModel. Falls back to "0" if the weapon has
   * neither dice nor a bonus.
   * @override
   * @param {Item} weapon
   * @returns {string}  e.g. "2d6", "2d6 + 5", "1d8 - 1"
   */
  getWeaponDamageFormula(weapon) {
    const count = weapon?.system?.diceCount ?? 1;
    const size  = weapon?.system?.dieSize  ?? "d6";
    const bonus = Number(weapon?.system?.bonus);   // "" → 0, non-numeric → NaN
    const dice  = count ? `${count}${size}` : "";
    const bonusPart = Number.isFinite(bonus) && bonus !== 0
      ? ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}`
      : "";
    if (!dice) return bonusPart ? String(bonus) : "0";
    return `${dice}${bonusPart}`;
  }

  /**
   * Return the localized display label for the weapon's damage type.
   * Uses the `damageType` field (a CONFIG.DND5E.damageTypes key) from the
   * ShipComponentSchemaMixin schema.
   * @override
   * @param {Item} weapon
   * @returns {string|null}
   */
  getWeaponDamageType(weapon) {
    const key = weapon?.system?.damageType;
    if (!key) return null;
    const cfg = CONFIG?.DND5E?.damageTypes?.[key];
    if (!cfg) return null;
    return typeof cfg === "string" ? cfg : (cfg.label ?? key);
  }

  /**
   * Bludgeoning is the standard damage type for ramming collisions in 5e.
   * @override
   * @returns {string}
   */
  getRamDamageType() {
    const cfg = CONFIG?.DND5E?.damageTypes?.bludgeoning;
    if (!cfg) return "Bludgeoning";
    return typeof cfg === "string" ? cfg : (cfg.label ?? "Bludgeoning");
  }

  /**
   * Ram collisions are bludgeoning damage — the KEY (matched against
   * traits.di/dr/dv sets by modifyDamageForType), not the display label.
   * @override
   * @returns {string}
   */
  getRamDamageTypeKey() {
    return "bludgeoning";
  }

  /* ── Skill resolution ───────────────────────────────────────────────────── */

  /**
   * Map an abstract role-skill key to the dnd5e 3-letter skill abbreviation.
   * Also accepts a bare abbreviation string (possibly "key|" with an empty
   * spec suffix written by getRoleSkillOptions).
   * @override
   * @param {string} roleSkill
   * @returns {{ key: string }}
   */
  resolveSkill(roleSkill) {
    const mapped = SKILL_MAP[roleSkill];
    if (mapped) return { ...mapped };

    // Accept a plain abbreviation string, optionally with a trailing "|" from
    // the dropdown value format (e.g. "acr|").
    const abbr = typeof roleSkill === "string"
      ? roleSkill.split("|")[0].trim()
      : null;
    if (abbr?.length) return { key: abbr };

    throw new Error(`Dnd5eAdapter: unknown roleSkill "${roleSkill}"`);
  }

  /**
   * Return the localized display name for a dnd5e skill abbreviation.
   * Reads CONFIG.DND5E.skills, which is populated before any module init hook.
   * @override
   * @param {string} key  3-letter abbreviation (e.g. "acr", "prc")
   * @returns {string}
   */
  getOverclockDC(heat, heatMax) {
    const ShipCombatState = globalThis.ShipCombat._api?.ShipCombatState;
    const ship = ShipCombatState?.ship;
    const reactor = ship?.items?.find(
      i => i.type === `${this.moduleId}.component` && i.system.slot === "reactor" && i.system.equipped !== false
    );
    const baseDC = reactor?.system?.overclockBaseDC ?? 10;
    if (heatMax <= 0) return baseDC;
    return Math.ceil(baseDC + (heat / heatMax) * 10);
  }

  /**
   * dnd5e overclock success: computeSuccessLevel() uses the actual DC, so
   * SL ≥ 1 is equivalent to roll.total ≥ DC — no special case needed.
   * @override
   */
  isOverclockSuccess(result, _options) {
    return result.SL >= 1;
  }

  /** @override */
  getRollDiceIcon() { return "fa-dice-d20"; }

  getSkillLabel(key) {
    const entry = CONFIG?.DND5E?.skills?.[key];
    if (entry?.label) return game.i18n.localize(entry.label);
    // Fallback: return the abbreviation as-is.
    return String(key ?? "");
  }

  /**
   * Default mapping from bridge role → primary skill.
   * Keys mirror the bridge-role IDs used by the core engine.
   * @override
   * @returns {Record<string, {skillKey: string, specialisation: string, rootLabel: string, label: string}>}
   */
  getDefaultRoleSkillMapping() {
    return {
      captain:  { skillKey: "per", specialisation: "", rootLabel: "Persuasion", label: "DND5E.SkillPer" },
      engineer: { skillKey: "arc", specialisation: "", rootLabel: "Arcana",     label: "DND5E.SkillArc" },
      pilot:    { skillKey: "acr", specialisation: "", rootLabel: "Acrobatics", label: "DND5E.SkillAcr" },
      sensors:  { skillKey: "prc", specialisation: "", rootLabel: "Perception", label: "DND5E.SkillPrc" },
      ordnance: { skillKey: "ath", specialisation: "", rootLabel: "Athletics",  label: "DND5E.SkillAth" },
      gunner:   { skillKey: "slt", specialisation: "", rootLabel: "Sleight of Hand", label: "DND5E.SkillSlt" },
    };
  }

  /**
   * Return the numeric total modifier for a dnd5e skill on an actor.
   * dnd5e stores this at `system.skills[abbreviation].total`.
   * @override
   * @param {Actor}  actor
   * @param {string} skillKey  3-letter abbreviation
   * @returns {number|null}
   */
  getSkillScore(actor, skillKey) {
    return actor?.system?.skills?.[skillKey]?.total ?? null;
  }

  /**
   * Return all dnd5e skills as selectable options for role main-skill dropdowns.
   * Value format is "abbreviation|" (no specialisations in 5e).
   * @override
   * @returns {Promise<Array<{value: string, skillKey: string, specName: string, label: string}>>}
   */
  async getRoleSkillOptions() {
    const skills = CONFIG?.DND5E?.skills ?? {};
    return Object.entries(skills)
      .map(([key, def]) => ({
        value:    `${key}|`,
        skillKey: key,
        specName: "",
        label:    game.i18n.localize(def.label ?? key),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /**
   * dnd5e has no extra per-actor skills beyond CONFIG.DND5E.skills.
   * @override
   * @returns {Promise<[]>}
   */
  async getActorExtraSkillOptions(_actor) {
    return [];
  }

  /**
   * Return the Acrobatics total of the pilot crew actor (the helm stat).
   * @override
   * @param {Actor|null} actor  pilot character
   * @returns {number|null}
   */
  getHelmRollModifier(actor) {
    return this.getSkillScore(actor, "acr");
  }

  /* ── d20 roll mechanics ─────────────────────────────────────────────────── */

  /** dnd5e ship combat uses a d20. @override */
  getRollFormula() { return "1d20"; }

  /** d20 modifier steps are whole integers. @override */
  getModifierStepSize() { return 1; }

  /**
   * Fixed hit bonuses (lock-tier, BDA, ranging-fire, battle-clarity) use +2
   * steps — matching the dnd5e convention of "+2 to hit" for meaningful bonuses.
   * @override
   */
  getHitBonusStep() { return 2; }

  /**
   * Sensor Disruption penalty: the disruptor's sensor Hit Modifier (a flat
   * d20 bonus in dnd5e), with a minimum of one range band (−1).
   * @override
   */
  getSensorDisruptionPenalty(sensorRating) {
    return Math.max(this.getModifierStepSize(), sensorRating ?? 0);
  }

  /** D&D 5e weapons can reach 20 bands beyond effective range, at −1 per band. */
  getMaxDecayBands(_sensorRating) { return 20; }

  /**
   * 5e SL ladder for ship-action skill checks — bands of 5, unbounded.
   *
   * Each full 5 points above the DC grants one additional Point:
   *   nat-1              → SL −1  (automatic failure, regardless of total)
   *   total < DC         → SL  0  (failure)
   *   DC ≤ total < DC+5  → SL  1  (1 Point)
   *   DC+5 ≤ total < DC+10 → SL 2  (2 Points)
   *   DC+10 ≤ total < DC+15 → SL 3 (3 Points)
   *   …and so on, unbounded.
   *   nat-20             → SL bumped +1 (no cap)
   *
   * For hit resolution, call with `target = targetAC`.
   *
   * @override
   * @param {Roll}   roll
   * @param {number} [target=10]  DC / target number
   * @returns {number}
   */
  computeSuccessLevel(roll, target = 10) {
    const d20   = this._d20(roll);
    const total = roll?.total ?? 0;

    if (d20 === 1) return -1;

    const sl = total >= target
      ? Math.floor((total - target) / 5) + 1
      : 0;

    return d20 === 20 ? sl + 1 : sl;
  }

  /**
   * Extract the face value of the first d20 in the roll (handles advantage /
   * disadvantage 2d20kh / 2d20kl correctly by reading the kept die).
   * @param {Roll|null} roll
   * @returns {number}
   */
  _d20(roll) {
    const dice = roll?.dice?.[0];
    if (!dice) return 0;
    // For 2d20kh/kl, only the kept result is active.
    const kept = dice.results.find(r => !r.discarded);
    return (kept ?? dice.results[0])?.result ?? 0;
  }

  /**
   * Hit decision for a single shot.
   *   nat-20 → auto-hit
   *   nat-1  → auto-miss
   *   else   → (roll.total + accuracy) >= targetAC
   *
   * When no targetAC is available (ordnance, unknown targets) falls back to DC 15.
   * @override
   */
  isHit(roll, accuracy, targetAC = null) {
    const d20 = this._d20(roll);
    if (d20 === 20) return true;
    if (d20 === 1)  return false;
    return (roll?.total ?? 0) + accuracy >= (targetAC ?? 15);
  }

  /** Natural 20 is an automatic critical hit in 5e, independent of margin. @override */
  isAutomaticCrit(roll) { return this._d20(roll) === 20; }

  /**
   * 5e crits on a natural 20 — no margin-based crits.  Fire for Effect (the
   * sensors BDA correction) expands the crit range by its Points, mirroring
   * how it reduces the crit margin on margin-based systems: 2 Points → crit
   * on a natural 18–20.
   * @override
   */
  isCriticalHit(roll, _accuracy, _targetAC = null, traits = {}) {
    const threshold = Math.max(2, 20 - (traits?.ffeReduction ?? 0));
    return this._d20(roll) >= threshold;
  }

  /** 5e critical misses on nat-1. @override */
  isCriticalMiss(roll, _accuracy, _targetAC = null, _traits = {}) {
    return this._d20(roll) === 1;
  }

  /**
   * Weapons with the `unreliable` trait jam on a natural 1.
   * In 5e, nat-1 is an auto-miss regardless of accuracy, so any natural-1
   * result is a jam for unreliable weapons.
   * @override
   */
  isJam(roll, _accuracy, traits, _targetAC = null) {
    return !!traits?.unreliable && this._d20(roll) === 1;
  }

  /** "+N" / "−N" with explicit sign. @override */
  formatModifier(value) {
    return `${value >= 0 ? "+" : ""}${value}`;
  }

  /** "DC N" — standard dnd5e phrasing for target numbers. @override */
  formatTargetNumber(target) {
    return `DC ${target}`;
  }

  /**
   * Display the total attack bonus together with the target's AC in the
   * targeting popup.  When the target AC is unknown shows the signed bonus alone.
   * @override
   */
  formatAccuracyDisplay(accuracy, targetAC = null) {
    const mod = this.formatModifier(accuracy);
    return targetAC !== null ? `${mod} to hit vs AC ${targetAC}` : `${mod} to hit`;
  }

  /**
   * Chat card accuracy display: show the target AC with a label, or null when
   * no target is known.
   * @override
   */
  formatChatAccuracyDisplay(_effectiveAccuracy, targetAC) {
    return targetAC !== null ? `AC ${targetAC}` : null;
  }

  /**
   * Chat card hit modifier: the signed total attack bonus (e.g. "+5").
   * @override
   */
  formatChatHitMod(effectiveAccuracy) {
    if (effectiveAccuracy === null) return null;
    return this.formatModifier(effectiveAccuracy);
  }

  /**
   * Build the 5e DC table HTML block shown in skill-check chat cards.
   *
   * Three tiers (Failure / Success / Great Success) anchored to `dc`:
   *   ≤ dc−1      → 0 Points  (Failure)
   *   dc – dc+9   → 1 Point   (Success)
   *   dc+10+      → 2 Points  (Great Success)
   *
   * The active row is determined by the BASE Points (before nat-20/1 bump) so
   * the player can see exactly where their roll landed.  The "Points Granted"
   * footer shows the FINAL adjusted value.
   *
   * @param {number} dc          DC used for this roll (default 10)
   * @param {number} finalSL     Adjusted points granted (after nat-20/1 bump)
   * @param {string} [roleSkill] Embedded as data-sc-role-skill for reroll hooks
   * @param {number} [natBonus]  −1, 0, or +1 nat adjustment
   * @returns {string}  HTML string
   */
  buildDCTableHtml(dc, finalSL, roleSkill = "", natBonus = 0) {
    // For nat-1 auto-fail the base SL is always 0; for nat-20 it's finalSL−1.
    const baseSL  = natBonus === -1 ? 0 : Math.max(0, finalSL - natBonus);
    const maxTier = Math.max(baseSL + 1, 3);  // always show at least 4 rows (0–3)

    const tiers = [];
    for (let sl = 0; sl <= maxTier; sl++) {
      let range;
      if (sl === 0) {
        range = `≤${dc - 1}`;
      } else if (sl === maxTier) {
        range = `${dc + (sl - 1) * 5}+`;   // open-ended last row
      } else {
        const low = dc + (sl - 1) * 5;
        range = `${low}–${low + 4}`;
      }
      const label = sl === 1 ? "1 Point" : `${sl} Points`;
      tiers.push({ range, sl, label, active: sl === baseSL });
    }

    const rows = tiers.map(t =>
      `<tr class="sc-sl-row${t.active ? " sc-sl-row--active" : ""}">
        <td>${t.range}</td><td>${t.label}</td>
      </tr>`
    ).join("");

    let natNote = "";
    if      (natBonus ===  1) natNote = `<div class="sc-nat-bonus sc-nat-20">Natural 20: +1 Point</div>`;
    else if (natBonus === -1) natNote = `<div class="sc-nat-bonus sc-nat-1">Natural 1: Automatic Failure</div>`;

    const roleAttr = roleSkill ? ` data-sc-role-skill="${roleSkill}"` : "";
    return `<div class="sc-points-table"${roleAttr}>
  <table class="sc-sl-table">
    <thead><tr><th>Roll</th><th>Result</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>${natNote}
  <div class="sc-points-granted">→ Points Granted: <strong>${finalSL}</strong></div>
</div>`;
  }

  /**
   * Append the DC table to the most recently posted ChatMessage.
   * Called after every rollSkillTest path so all roles get a consistent table.
   *
   * @param {Roll}   roll
   * @param {string} [roleSkill]
   * @param {number} [dc=10]
   * @returns {Promise<string|null>}  message id, or null if no message found
   */
  async _postAddDCTable(roll, roleSkill = "", dc = 10) {
    const msg = game.messages.contents.at(-1);
    if (!msg) return null;
    const d20      = this._d20(roll);
    const natBonus = d20 === 20 ? 1 : d20 === 1 ? -1 : 0;
    const finalSL  = Math.max(0, this.computeSuccessLevel(roll, dc));
    const tableHtml = this.buildDCTableHtml(dc, finalSL, roleSkill, natBonus);
    await msg.update({ flavor: `${msg.flavor ?? ""}\n${tableHtml}` });
    return msg.id;
  }

  /**
   * Enrich a chat-message flavor with the 5e DC table.
   * @override
   */
  buildSkillRollFlavor(baseFlavor, roll, sl) {
    const dc       = 10;   // default ship-action DC
    const d20      = this._d20(roll);
    const natBonus = d20 === 20 ? 1 : d20 === 1 ? -1 : 0;
    return `${baseFlavor}\n${this.buildDCTableHtml(dc, Math.max(0, sl), "", natBonus)}`;
  }

  /* ── Roll API ───────────────────────────────────────────────────────────── */

  /**
   * Roll a skill check for a crew member via dnd5e's Actor#rollSkill API.
   * Returns null when the user cancels the dialog (or the actor lacks the skill).
   *
   * @override
   * @param {Actor}  crewActor
   * @param {string} roleSkill  abstract role-skill key or plain dnd5e abbreviation
   * @param {object} [options]  { event, dc, fastForward }
   * @returns {Promise<{SL: number, succeeded: boolean, roll: Roll, messageId: string|null}|null>}
   */
  async rollSkillTest(crewActor, roleSkill, options = {}) {
    const { key }         = this.resolveSkill(roleSkill);
    const dc              = options.dc ?? 10;
    const skipPointsTable = options.skipPointsTable ?? false;

    // dnd5e Actor#rollSkill returns D20Roll[]|null
    const rolls = await crewActor.rollSkill(
      { skill: key, event: options.event },
      options.fastForward ? { configure: false } : {},
      {}
    ) ?? [];
    const roll = rolls?.[0] ?? null;
    if (!roll) return null;   // user cancelled dialog

    const SL        = this.computeSuccessLevel(roll, dc);
    const messageId = skipPointsTable ? null : await this._postAddDCTable(roll, roleSkill, dc);
    return { SL, succeeded: SL >= 1, roll, messageId };
  }

  /**
   * Roll ship initiative for a crew actor.
   * Builds a plain 1d20 + skill-mod roll so the result is a simple numeric
   * total suitable for the combat tracker.
   *
   * @override
   * @returns {Promise<{total: number, roll: Roll, message: ChatMessage|null}>}
   */
  async rollShipInitiative(crewActor, roleSkill, options = {}) {
    const { key } = this.resolveSkill(roleSkill);
    const mod     = this.getSkillScore(crewActor, key) ?? 0;
    const flavor  = options.flavor
      ?? `${game.i18n.localize("SHIPCOMBAT.Initiative")} (${this.getSkillLabel(key)})`;

    const roll = await new Roll("1d20 + @mod", { mod }).evaluate();
    const msg  = await roll.toMessage({
      flavor,
      speaker: options.speaker ?? ChatMessage.getSpeaker({ actor: crewActor }),
    });
    return { total: roll.total, roll, message: msg ?? null };
  }

  /**
   * Initiative roll for NPC ships that store a raw numeric attribute.
   * @override
   * @returns {Promise<{total: number, roll: Roll, message: ChatMessage|null}>}
   */
  async rollShipInitiativeFromAttribute(attributeValue, flavorLabel, options = {}) {
    const roll = await new Roll("1d20 + @val", { val: attributeValue ?? 0 }).evaluate();
    const msg  = await roll.toMessage({
      flavor:  flavorLabel,
      speaker: options.speaker ?? {},
    });
    return { total: roll.total, roll, message: msg ?? null };
  }

  /**
   * d20 initiative totals are stored directly in the combat tracker — no
   * transformation needed.
   * @override
   */
  toCombatantInitiative(rawTotal, _shipActor) { return rawTotal; }

  /**
   * Full hit resolution for a single fire event.
   * Rolls 1d20 + Σ(modifiers), posts a chat card, and returns the outcome.
   *
   * The modifier sum IS baked into the roll formula so `roll.total` already
   * reflects the complete attack roll.  `isHit()` therefore receives
   * accuracy = 0 — the roll itself carries the bonus.
   *
   * @override
   * @returns {Promise<{hit: boolean, sl: number, roll: Roll,
   *                    message: ChatMessage|null, displayTarget: number|null,
   *                    breakdownParts: string[]}>}
   */
  async resolveHitRoll(context) {
    const { modifiers = [], weaponItem, targetActor, options = {} } = context;

    const totalMod  = modifiers.reduce((sum, m) => sum + (m.value ?? 0), 0);
    const roll      = await new Roll("1d20 + @mod", { mod: totalMod }).evaluate();
    const targetAC  = this.getTargetAC(targetActor);

    // Hit: nat-20 auto-hit, nat-1 auto-miss, else total >= AC
    const hit    = this.isHit(roll, 0, targetAC);
    const isCrit = this.isAutomaticCrit(roll);
    const sl     = this.computeSuccessLevel(roll, targetAC ?? 15);

    const breakdownParts = modifiers
      .filter(m => m.value !== 0)
      .map(m => `${m.label ?? m.key ?? "?"}: ${this.formatModifier(m.value)}`);

    const flavor = options.flavor
      ?? (weaponItem?.name ?? game.i18n.localize("SHIPCOMBAT.Attack"));

    const msg = await roll.toMessage({
      flavor,
      speaker: options.speaker
        ?? (targetActor ? ChatMessage.getSpeaker({ actor: targetActor }) : {}),
    });

    return {
      hit: hit || isCrit,
      sl,
      roll,
      message:      msg ?? null,
      displayTarget: targetAC,
      breakdownParts,
    };
  }

  /**
   * Extract { SL, roll } from a posted ChatMessage so reroll hooks can react
   * to post-hoc SL changes.  dnd5e stores rolls in `message.rolls`; SL is
   * recomputed from the roll total using the default DC (10).
   *
   * @override
   */
  parseRollResultFromMessage(message) {
    const roll = message?.rolls?.[0] ?? null;
    if (!roll) return { SL: null, roll: null };
    return { SL: this.computeSuccessLevel(roll), roll };
  }

  /**
   * Apply dnd5e damage immunities, resistances, vulnerabilities, and damage
   * modification to an incoming hull damage value.
   *
   * Mirrors Actor5e.calculateDamage exactly:
   *   1. Immunity        — damage becomes 0.
   *   2. Modification    — traits.dm.amount[type] AND traits.dm.amount.ALL are
   *                        flat ADDITIVE amounts (deterministic formulas),
   *                        applied BEFORE resistance/vulnerability.  If adding
   *                        the modification would flip the damage's sign, the
   *                        damage clamps to 0 instead.
   *   3. Resistance      — halve, truncating toward zero.
   *   4. Vulnerability   — double.
   *
   * Weapon-property bypasses (mgc/ada/sil) are not modelled: ship weapons
   * carry no physical weapon properties, which in Actor5e.calculateDamage
   * means bypasses never apply.
   *
   * @override
   * @param {number} hullDamage
   * @param {string} damageType
   * @param {Actor} targetActor
   * @returns {{ finalDamage: number, immune: boolean, note: string|null }}
   */
  modifyDamageForType(hullDamage, damageType, targetActor) {
    const traits = targetActor?.system?.traits;
    if (!traits) return { finalDamage: hullDamage, immune: false, note: null };

    // 1. Immunity — full block
    if (traits.di?.value?.has?.(damageType)) {
      return { finalDamage: 0, immune: true, note: game.i18n.localize("DND5E.Immune") };
    }

    let damage = hullDamage;
    const notes = [];

    // 2. Damage modification — flat additive amount (per-type + "ALL"),
    //    before resistance/vulnerability, with dnd5e's sign-flip clamp.
    const rollData = targetActor.getRollData?.({ deterministic: true }) ?? {};
    const simplifyBonus = globalThis.dnd5e?.utils?.simplifyBonus;
    const applyModification = (formula) => {
      if (!formula) return;
      let amount = 0;
      if (simplifyBonus) {
        amount = simplifyBonus(formula, rollData);
      } else {
        try {
          const r = new Roll(String(formula), rollData);
          r.evaluateSync({ strict: false });
          amount = r.total ?? 0;
        } catch (_) { return; /* malformed formula — ignore, matching simplifyBonus */ }
      }
      if (!amount) return;
      const modified = damage + amount;
      damage = Math.sign(damage) !== Math.sign(modified) ? 0 : modified;
      notes.push(`${game.i18n.localize("DND5E.DamageModification.Label")} ${amount > 0 ? "+" : ""}${amount}`);
    };
    applyModification(traits.dm?.amount?.[damageType]);
    applyModification(traits.dm?.amount?.ALL);

    // 3. Resistance — halve, truncating toward zero (Math.trunc, per dnd5e).
    if (traits.dr?.value?.has?.(damageType)) {
      damage = Math.trunc(damage / 2);
      notes.push(game.i18n.localize("DND5E.Resistance") + " ×½");
    }

    // 4. Vulnerability — double.
    if (traits.dv?.value?.has?.(damageType)) {
      damage = damage * 2;
      notes.push(game.i18n.localize("DND5E.Vulnerability") + " ×2");
    }

    return { finalDamage: Math.max(0, Math.trunc(damage)), immune: false, note: notes.join(", ") || null };
  }

  /**
   * Return IWR data in the shape expected by the core engine.
   *
   * @override
   * @param {Actor} actor
   * @returns {{ immunities: string[], weaknesses: {type:string,value:number}[], resistances: {type:string,value:number}[] }|null}
   */
  getIWR(actor) {
    const t = actor?.system?.traits;
    if (!t) return null;
    return {
      immunities:  [...(t.di?.value ?? []), ...(t.ci?.value ?? [])],
      weaknesses:  [...(t.dv?.value ?? [])].map(type => ({ type, value: 2   })),
      resistances: [...(t.dr?.value ?? [])].map(type => ({ type, value: 0.5 })),
    };
  }
}
