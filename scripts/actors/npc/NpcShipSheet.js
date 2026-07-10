/**
 * NpcShipSheet — sheet for "causodes-shipcombat-dnd5e.npcShip" actors.
 *
 * Extends core's NpcShipSheetMixin over dnd5e's NPCActorSheet (the same
 * pattern OrdnanceSheet uses with OrdnanceSheetMixin), so all of core's NPC
 * ship behavior is inherited:
 *   - per-part context (sys, shields, sectors, gunnerCtx, weaponSections,
 *     helm, conditionsList, ammoTracks, …) consumed by the core tab templates
 *   - the npc* action handlers (roll initiative/piloting/ordnance, SL
 *     allocation, weapon fire, shield allocation, ordnance launch, …)
 *   - render wiring (helm sliders, shield-arc compass, macro tier pickers)
 *   - component / ordnance-template drop handling
 *
 * dnd5e-specific changes on top:
 *   1. Structural PARTS use native dnd5e NPC chrome (our header/sidebar,
 *      collapser, warnings, right-side icon tab strip); tab content templates
 *      still come from causodes-shipcombat-core.
 *   2. TABS converted to the array form dnd5e's PrimarySheetMixin requires,
 *      with icons.
 *   3. Crash guards for NPCActorSheet context builders that access fields
 *      which don't exist on NpcShipModel (header/sidebar overrides,
 *      inventory/attunement no-ops).
 *   4. Drop-signature bridges: dnd5e's drop pipeline calls
 *      _onDropActor(event, actor) / _onDropItem(event, item) with resolved
 *      documents, while core's mixin expects (dragData, event).
 */

const CORE_MODULE_ID = "causodes-shipcombat-core";
const MODULE_ID      = "causodes-shipcombat-dnd5e";

/* ── d20 NPC check handlers (ported from the SF2e module) ────────────────────
 * Core's mixin rolls a bare check against the attribute as a d100-style target
 * number; in dnd5e the NPC attributes (PIL / TEC / GUN) are flat d20 modifiers
 * rolled against the standard ship-action DC of 10 — matching the player-side
 * rollSkillTest. Sensor Disruption costs one range band (−1) on all rolls.
 * Wired into DEFAULT_OPTIONS.actions below, overriding the core mixin's
 * same-named handlers.
 */

async function _npcRollPiloting() {
  const { SystemAdapter, ShipCombatState } = globalThis.ShipCombat._api;
  const adapter = SystemAdapter.current;
  const sys     = adapter.getShipData(this.actor);
  const pil     = (sys.attributes?.piloting ?? 0) - ShipCombatState.getDisruptionPenalty(this.actor);
  const pilStr  = `${pil >= 0 ? "+" : ""}${pil}`;
  const roll    = await new Roll("1d20 + @mod", { mod: pil }).evaluate();
  const sl      = adapter.computeSuccessLevel(roll, 10);
  const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.Helm.RollPiloting")} (PIL ${pilStr})`;
  const msg = await roll.toMessage({
    flavor:  adapter.buildSkillRollFlavor(baseFlavor, roll, sl),
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  });
  await this.actor.update({
    [adapter.systemPath("resources.pilot.pilotingSL")]:        Math.max(0, sl),
    [adapter.systemPath("resources.pilot.pilotingMessageId")]: msg.id,
  });
}

async function _npcRollOrdnance() {
  const { SystemAdapter, ShipCombatState } = globalThis.ShipCombat._api;
  const adapter = SystemAdapter.current;
  const sys     = adapter.getShipData(this.actor);
  if (sys.resources?.gunner?.ordnanceRolled) {
    return ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.Warning.AlreadyRolledOrdnance"));
  }
  const gun    = (sys.attributes?.gunnery ?? 0) - ShipCombatState.getDisruptionPenalty(this.actor);
  const gunStr = `${gun >= 0 ? "+" : ""}${gun}`;
  const roll   = await new Roll("1d20 + @mod", { mod: gun }).evaluate();
  const sl     = Math.max(0, adapter.computeSuccessLevel(roll, 10));
  const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.NpcShip.Gunnery")} (GUN ${gunStr})`;
  await roll.toMessage({
    flavor:  adapter.buildSkillRollFlavor(baseFlavor, roll, sl),
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  });
  await this.actor.update({
    [adapter.systemPath("resources.gunner.ordnanceSL")]:       sl,
    [adapter.systemPath("resources.gunner.ordnanceRolled")]:   true,
    [adapter.systemPath("resources.gunner.allocAccuracy")]:    0,
    [adapter.systemPath("resources.gunner.allocPenetration")]: 0,
    [adapter.systemPath("resources.gunner.allocFirepower")]:   0,
    [adapter.systemPath("resources.gunner.slLocked")]:         false,
  });
}

async function _npcSuppressFire() {
  const { SystemAdapter, ShipCombatState } = globalThis.ShipCombat._api;
  const adapter = SystemAdapter.current;
  const sys = adapter.getShipData(this.actor);
  if (sys.engActionUsed) return ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.NpcShip.EngActionUsed"));
  if ((sys.internalFire ?? 0) <= 0) return;
  const tec    = (sys.attributes?.tech ?? 0) - ShipCombatState.getDisruptionPenalty(this.actor);
  const tecStr = `${tec >= 0 ? "+" : ""}${tec}`;
  const roll   = await new Roll("1d20 + @mod", { mod: tec }).evaluate();
  const sl     = adapter.computeSuccessLevel(roll, 10);
  const reduction = Math.max(0, 5 + sl);
  const curFire = sys.internalFire ?? 0;
  const newFire = Math.max(0, curFire - reduction);
  const calcSnippet = `<div class="sc-eng-result">Fire suppressed by: 5 + ${sl} = ${reduction} &nbsp;(${curFire} → ${newFire})</div>`;
  const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.NpcShip.SuppressFire")} (${game.i18n.localize("SHIPCOMBAT.NpcShip.Tech")} TEC ${tecStr})\n${calcSnippet}`;
  await roll.toMessage({ flavor: adapter.buildSkillRollFlavor(baseFlavor, roll, sl), speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
  await this.actor.update({
    [adapter.systemPath("internalFire")]:  newFire,
    [adapter.systemPath("engActionUsed")]: true,
  });
}

async function _npcReduceHeat() {
  const { SystemAdapter, ShipCombatState } = globalThis.ShipCombat._api;
  const adapter = SystemAdapter.current;
  const sys = adapter.getShipData(this.actor);
  if (sys.engActionUsed) return ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.NpcShip.EngActionUsed"));
  if ((sys.heat ?? 0) <= 0) return;
  const tec    = (sys.attributes?.tech ?? 0) - ShipCombatState.getDisruptionPenalty(this.actor);
  const tecStr = `${tec >= 0 ? "+" : ""}${tec}`;
  const roll   = await new Roll("1d20 + @mod", { mod: tec }).evaluate();
  const sl     = adapter.computeSuccessLevel(roll, 10);
  const reduction = Math.max(0, 5 + sl);
  const curHeat = sys.heat ?? 0;
  const newHeat = Math.max(0, curHeat - reduction);
  const calcSnippet = `<div class="sc-eng-result">Heat reduced by: 5 + ${sl} = ${reduction} &nbsp;(${curHeat} → ${newHeat})</div>`;
  const baseFlavor = `${game.i18n.localize("SHIPCOMBAT.NpcShip.ReduceHeat")} (${game.i18n.localize("SHIPCOMBAT.NpcShip.Tech")} TEC ${tecStr})\n${calcSnippet}`;
  await roll.toMessage({ flavor: adapter.buildSkillRollFlavor(baseFlavor, roll, sl), speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
  await this.actor.update({
    [adapter.systemPath("heat")]:          newHeat,
    [adapter.systemPath("engActionUsed")]: true,
  });
}

export function buildNpcShipSheet(NPCActorSheet) {
  const { NpcShipSheetMixin } = globalThis.ShipCombat._api;

  class NpcShipSheet extends NpcShipSheetMixin(NPCActorSheet) {

    /* ── Static configuration ─────────────────────────────────────────── */

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        classes: ["causodes-shipcombat-dnd5e", "starship", "npc"],
        window:   { title: "SHIPCOMBAT.DND5E.Sheet.NpcShip" },
        position: { width: 800, height: 1000 },
        // d20-modifier NPC checks (override core's d100-style handlers)
        actions: {
          npcRollPiloting: _npcRollPiloting,
          npcRollOrdnance: _npcRollOrdnance,
          npcSuppressFire: _npcSuppressFire,
          npcReduceHeat:   _npcReduceHeat,
          // The portrait "Roll Initiative" button (data-action="rollInitiative")
          // is rendered by dnd5e's native NPC chrome and calls
          // actor.rollInitiativeDialog() by default, which bypasses the
          // module's Combat.prototype.rollInitiative patch and breaks for ship
          // actors.  Override it here to use the same d20+PIL path as the
          // Combat tracker patch.
          rollInitiative: async function rollInitiative() {
            const { SystemAdapter } = globalThis.ShipCombat._api;
            const adapter = SystemAdapter.current;
            const sys     = adapter.getShipData(this.actor);
            const pil     = sys.attributes?.piloting ?? 0;
            const { total } = await adapter.rollShipInitiativeFromAttribute(
              pil,
              game.i18n.localize("SHIPCOMBAT.NpcShip.RollInitiative"),
              { speaker: ChatMessage.getSpeaker({ actor: this.actor }) },
            );
            if (!game.combat) return;
            const token     = this.actor.getActiveTokens()?.[0];
            const combatant = token
              ? game.combat.combatants.find(c => c.tokenId === token.id)
              : game.combat.combatants.find(c => c.actor?.id === this.actor.id);
            if (combatant) {
              await combatant.update({ initiative: adapter.toCombatantInitiative(total, this.actor) });
            }
          },
        },
      },
      { inplace: false }
    );

    /**
     * Explicit native NPC structural templates + core's four ship content tabs.
     * Every path is hardcoded so there is zero ambiguity.
     * @override
     */
    static PARTS = {
      header: {
        template: `modules/${MODULE_ID}/templates/actor/npc/header.hbs`,
      },
      sidebarCollapser: {
        container: { classes: ["main-content"], id: "main" },
        template:  "systems/dnd5e/templates/actors/parts/sidebar-collapser.hbs",
      },
      sidebar: {
        container: { classes: ["main-content"], id: "main" },
        template:  `modules/${MODULE_ID}/templates/actor/player-ship-sidebar.hbs`,
        templates: ["systems/dnd5e/templates/actors/parts/actor-trait-line.hbs"],
      },
      // ── Ship content tabs ──────────────────────────────────────────────
      // main is OUR clone of core's npc-ship-body.hbs with the standalone
      // Armour section removed — armour is edited in the header card instead.
      main: {
        container: { classes: ["tab-body"], id: "tabs" },
        template:  `modules/${MODULE_ID}/templates/actor/npc/overview.hbs`,
        scrollable: [""],
      },
      movement: {
        container: { classes: ["tab-body"], id: "tabs" },
        template:  `modules/${CORE_MODULE_ID}/templates/actor/tabs/npc/npc-ship-movement.hbs`,
        scrollable: [""],
      },
      gunner: {
        container: { classes: ["tab-body"], id: "tabs" },
        template:  `modules/${CORE_MODULE_ID}/templates/actor/tabs/npc/npc-ship-gunner.hbs`,
        scrollable: [""],
      },
      ordnance: {
        container: { classes: ["tab-body"], id: "tabs" },
        template:  `modules/${CORE_MODULE_ID}/templates/actor/tabs/npc/npc-ship-ordnance.hbs`,
        scrollable: [""],
      },
      // ── Native NPC structural tail ─────────────────────────────────────
      warnings: {
        template: "systems/dnd5e/templates/actors/parts/actor-warnings-dialog.hbs",
      },
      tabs: {
        id:       "tabs",
        classes:  ["tabs-right"],
        template: "systems/dnd5e/templates/shared/sidebar-tabs.hbs",
      },
    };

    /**
     * Four right-side icon tabs matching the dnd5e NPC sheet style.
     * Must be an array — dnd5e PrimarySheetMixin calls .find() / .reduce().
     * Movement uses the same icon as the player ship's pilot tab.
     * @override
     */
    static TABS = [
      { tab: "main",     group: "primary", label: "SHIPCOMBAT.Tab.Overview",        icon: "fas fa-star"           },
      { tab: "movement", group: "primary", label: "SHIPCOMBAT.Tab.Movement",        icon: "fas fa-steering-wheel" },
      { tab: "gunner",   group: "primary", label: "SHIPCOMBAT.Tab.NpcWeapons",      icon: "fas fa-crosshairs"     },
      { tab: "ordnance", group: "primary", label: "SHIPCOMBAT.NpcShip.OrdnanceTab", icon: "fas fa-bomb"           },
    ];

    /* ── Instance configuration ───────────────────────────────────────── */

    /** @override — open on the overview tab by default. */
    tabGroups = { primary: "main" };

    /** @override — no inventory/spell filters on ship tabs. */
    _filters = {};

    /* ── Accessors ────────────────────────────────────────────────────── */

    /** @override */
    get title() {
      return this.actor.name ?? game.i18n.localize("SHIPCOMBAT.DND5E.Sheet.NpcShip");
    }

    /* ── Context preparation ──────────────────────────────────────────── */

    /**
     * Provide safe context for npc/header.hbs.
     * NpcShipModel has attributes.hp, attributes.ac, attributes.init mirrored
     * from hull.  Fields it does NOT have (abilities, CR, legendary actions)
     * are stubbed so the NPC template renders gracefully.
     * @override
     */
    async _prepareHeaderContext(context, options) {
      context.portrait       = await this._preparePortrait(context);
      // Per-sector shield overcap flags — the header's save-tab values turn
      // blue (shield-overcharged) when current shields exceed the zone max.
      // Computed from the actor directly: the mixin's `sectors` context is
      // merged AFTER this dispatch runs.
      const sysHdr = this.actor.system;
      context.shieldOvercharged = Object.fromEntries(
        ["bow", "stern", "port", "starboard"].map(s =>
          [s, (sysHdr.shields?.[s] ?? 0) > (sysHdr.shieldMax?.[s] ?? 0)]
        )
      );
      context.abilities      = [];
      context.legact         = [];
      context.legres         = [];
      context.hasLegendaries = false;
      context.hasClasses     = false;
      context.showDeathSaves      = false;
      context.showInitiativeScore = false;
      context.showLoyalty    = false;
      context.showRests      = false;
      context.modernRules    = false;
      // PIL modifier displayed in — and rolled from — the portrait initiative badge.
      context.npcInitMod = sysHdr.attributes?.piloting ?? 0;
      return context;
    }

    /**
     * Provide safe context for the shared player-ship sidebar template.
     * NpcShipModel has traits (dr/di/dv/dm/ci) which _prepareTraits reads
     * correctly.  Speed, skills, and senses are stubbed as empty arrays because
     * NpcShipModel does not implement attributes.movement or attributes.senses
     * in the dnd5e creature format — calling _prepareSenses() or the native
     * speed loop would throw.  Habitat and treasure stubs prevent crashes on
     * optional-chained reads that still require specific field shapes.
     * @override
     */
    async _prepareSidebarContext(context, options) {
      try { context.traits = this._prepareTraits(context); }
      catch (e) { context.traits = {}; }
      context.speed    = [];
      context.skills   = [];
      context.senses   = [];
      context.habitat  = undefined;
      context.gear     = undefined;
      context.treasure = undefined;
      context.important = this.actor.system.traits?.important ?? false;
      return context;
    }

    /* ── Drag & drop bridges ──────────────────────────────────────────── */

    /**
     * dnd5e's drop pipeline resolves the dropped document and calls
     * _onDropActor(event, actor); core's NpcShipSheetMixin expects
     * (dragData, event).  Bridge the signatures.
     * @override
     */
    async _onDropActor(event, actor) {
      const data = actor?.toDragData?.() ?? actor;
      return super._onDropActor(data, event);
    }

    /** @override — same bridge for component item drops. */
    async _onDropItem(event, item) {
      const data = item?.toDragData?.() ?? item;
      return super._onDropItem(data, event);
    }

    /* ── Rendering ────────────────────────────────────────────────────── */

    /** @override — ships have no inventory toolbar. */
    _renderCreateInventory() {}

    /** @override — ships do not attune items. */
    _renderAttunement() {}

    /** @override — ships have no spellbook part. */
    _renderSpellbook() {}

  }

  return NpcShipSheet;
}
