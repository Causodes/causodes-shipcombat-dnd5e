/**
 * causodes-shipcombat-dnd5e — D&D 5e integration layer.
 *
 * ─── Architecture ─────────────────────────────────────────────────────────
 *
 * D&D 5e is AppV2-native and uses a direct dataModels registry — there is no
 * actor proxy (unlike SF2e's ActorProxyPF2e) and no item proxy.  Module-defined
 * actor types are registered simply via CONFIG.Actor.dataModels.
 *
 * Three distinct actor types mirror the SF2e/Impmal companions so every
 * `actor.type` check inside causodes-shipcombat-core works verbatim:
 *
 *   causodes-shipcombat-dnd5e.ship          → player starship (PlayerShipSheet)
 *   causodes-shipcombat-dnd5e.npcShip       → NPC starship    (NpcShipSheet)
 *   causodes-shipcombat-dnd5e.shipOrdnance  → torpedo / strike craft (OrdnanceSheet)
 *
 * The Create Actor dialog is collapsed to a single "Starship" entry: the
 * npcShip and shipOrdnance types are hidden from the type list, and picking
 * "Starship" opens a follow-up prompt (Player / NPC / Ordnance) that retypes
 * the freshly created actor before its sheet is opened.  See the
 * Actor5e.createDialog wrapper below.
 *
 * Hull convention (hullDisplayMode = "hpRemaining"):
 *   hull.value = REMAINING hull points  ↔  system.attributes.hp.value
 *   hull.max   = maximum hull points    ↔  system.attributes.hp.max
 *
 * D&D 5e uses HP, not wounds/damage-taken.  Each model's prepareDerivedData()
 * mirrors hull.* into attributes.hp.* so the inherited dnd5e NPC sheet HP
 * display always stays in sync with core's engine (see dnd5e-compat.js).
 *
 * ─── Hook order ────────────────────────────────────────────────────────────
 *
 *   (module eval)   → ShipCombat.configure() called with Dnd5eAdapter
 *   Hooks.once("init")  → register dataModels, registerSheet, createDialog wrapper
 *   Hooks.once("ready") → one-time migration of legacy "starship" actors
 */

import { Dnd5eAdapter }        from "./scripts/systems/dnd5e-adapter.js";
import { ShipModel }           from "./scripts/actors/starship/ShipModel.js";
import { NpcShipModel }        from "./scripts/actors/npc/NpcShipModel.js";
import { ShipOrdnanceModel }   from "./scripts/actors/ordnance/ShipOrdnanceModel.js";
import { ShipComponentModel }  from "./scripts/items/ShipComponentModel.js";
import { buildPlayerShipSheet } from "./scripts/actors/starship/PlayerShipSheet.js";
import { buildNpcShipSheet }   from "./scripts/actors/npc/NpcShipSheet.js";
import { buildOrdnanceSheet }  from "./scripts/actors/ordnance/OrdnanceSheet.js";
import { buildShipComponentSheet } from "./scripts/items/ShipComponentSheet.js";
import { StarshipClassificationConfig } from "./scripts/actors/starship/StarshipClassificationConfig.js";
import { StarshipMovementConfig }       from "./scripts/actors/starship/StarshipMovementConfig.js";
import { StarshipHitPointsConfig }      from "./scripts/actors/starship/StarshipHitPointsConfig.js";
import { StarshipArmorClassConfig }     from "./scripts/actors/starship/StarshipArmorClassConfig.js";
import { OrdnanceArmorClassConfig }     from "./scripts/actors/ordnance/OrdnanceArmorClassConfig.js";

// ── Configure core engine ───────────────────────────────────────────────────
// MUST be called at module-evaluation time, before the "init" hook fires.
ShipCombat.configure({
  moduleId: "causodes-shipcombat-dnd5e",
  adapter:  new Dnd5eAdapter(),
});

const MODULE_ID      = "causodes-shipcombat-dnd5e";
const SHIP_TYPE      = `${MODULE_ID}.ship`;
const NPC_SHIP_TYPE  = `${MODULE_ID}.npcShip`;
const ORDNANCE_TYPE  = `${MODULE_ID}.shipOrdnance`;
const COMPONENT_TYPE = `${MODULE_ID}.component`;
const LEGACY_STARSHIP_TYPE = `${MODULE_ID}.starship`;
const SHIP_ICON = "systems/dnd5e/icons/svg/damage/radiant.svg";

/**
 * Build the StarshipSubtypePrompt dialog class — the follow-up prompt shown
 * after the user picks "Starship" in the Create Actor dialog.
 *
 * Extends dnd5e's Dialog5e (the same base class as the system's own popups)
 * with the "create-document" styling class, so the three choices render as
 * the same radio-card list the native Create Actor dialog uses (icon + label
 * rows, one Confirm button — no per-choice buttons).
 *
 * Deferred to a factory because dnd5e's global API namespace is only
 * populated during the system's "init" hook.
 */
function buildStarshipSubtypePrompt() {
  const Dialog5e = globalThis.dnd5e?.applications?.api?.Dialog5e;
  if (!Dialog5e) return null;

  return class StarshipSubtypePrompt extends Dialog5e {
    /** @override */
    static DEFAULT_OPTIONS = {
      classes:  ["create-document", "starship-subtype-prompt"],
      window:   { title: "SHIPCOMBAT.DND5E.CreateDialog.Title", icon: "fa-solid fa-rocket" },
      position: { width: 350 },
      form: {
        handler: StarshipSubtypePrompt.#onSubmit,
        closeOnSubmit: true,
      },
      buttons: [
        { type: "submit", icon: "fa-solid fa-check", label: "SHIPCOMBAT.DND5E.CreateDialog.Confirm" },
      ],
    };

    /** @override */
    static PARTS = {
      ...super.PARTS,
      content: {
        template: `modules/${MODULE_ID}/templates/apps/starship-subtype-prompt.hbs`,
      },
    };

    /** Chosen subtype ("player" | "npc" | "ordnance"); null until submitted. */
    selected = null;

    /** @override */
    async _prepareContentContext(context, options) {
      context.types = [
        {
          value: "player", selected: true,
          label: game.i18n.localize("SHIPCOMBAT.DND5E.ShipMode.Player"),
          icon:  "systems/dnd5e/icons/svg/actors/character.svg",
        },
        {
          value: "npc",
          label: game.i18n.localize("SHIPCOMBAT.DND5E.ShipMode.NPC"),
          icon:  "systems/dnd5e/icons/svg/actors/npc.svg",
        },
        {
          value: "ordnance",
          label: game.i18n.localize("SHIPCOMBAT.DND5E.ShipMode.Ordnance"),
          icon:  "systems/dnd5e/icons/svg/damage/poison.svg",
        },
      ];
      return context;
    }

    /**
     * Record the selected subtype; closeOnSubmit then closes the dialog.
     * @this {StarshipSubtypePrompt}
     */
    static async #onSubmit(event, form, formData) {
      this.selected = formData.object.subtype ?? null;
    }

    /**
     * Render the prompt and resolve with the chosen subtype, or null if the
     * dialog is dismissed without submitting.
     * @returns {Promise<string|null>}
     */
    static async wait() {
      const { promise, resolve } = Promise.withResolvers();
      const dialog = new this();
      dialog.addEventListener("close", () => resolve(dialog.selected), { once: true });
      dialog.render({ force: true });
      return promise;
    }
  };
}

// Built during "init" (once dnd5e's API namespace exists).
let StarshipSubtypePrompt = null;

/**
 * Show the subtype prompt.  Returns "player" | "npc" | "ordnance", or null
 * if dismissed.  Falls back to a plain DialogV2 if the dnd5e dialog class
 * was unavailable at init.
 */
async function promptStarshipSubtype() {
  if (StarshipSubtypePrompt) return StarshipSubtypePrompt.wait();
  return foundry.applications.api.DialogV2.wait({
    classes:  ["dnd5e2"],
    window:   { title: game.i18n.localize("SHIPCOMBAT.DND5E.CreateDialog.Title"), icon: "fa-solid fa-rocket" },
    position: { width: 420 },
    content:  `<p style="text-align: center;">${game.i18n.localize("SHIPCOMBAT.DND5E.CreateDialog.Hint")}</p>`,
    buttons: [
      { action: "player",   label: "SHIPCOMBAT.DND5E.ShipMode.Player",   default: true },
      { action: "npc",      label: "SHIPCOMBAT.DND5E.ShipMode.NPC" },
      { action: "ordnance", label: "SHIPCOMBAT.DND5E.ShipMode.Ordnance" },
    ],
    rejectClose: false,
  });
}

// ── init hook ───────────────────────────────────────────────────────────────
Hooks.once("init", () => {
  // ── 0a. Override ShipCombatState.getReactorStats to read coreOutput ──────
  // dnd5e uses system.coreOutput on reactor components (instead of system.rating,
  // which is reserved for sensors) to avoid duplicate-named inputs colliding in
  // the AppV2 form data.
  const { ShipCombatState } = globalThis.ShipCombat._api;
  ShipCombatState.getReactorStats = function(shipActor) {
    const ship = shipActor ?? this.ship;
    if (!ship) return { coreOutput: 0, shieldStrengthPerCore: 0, heatCapacity: 0, auxPowerCapacity: 0, reserveMultiplier: 0, overclockBaseDC: null };
    const reactor = ship.items.find(i => i.type === COMPONENT_TYPE && i.system.slot === "reactor" && i.system.equipped !== false);
    return {
      coreOutput:            reactor?.system?.coreOutput ?? 0,
      shieldStrengthPerCore: reactor?.system?.shieldStrengthPerCore ?? 0,
      heatCapacity:          reactor?.system?.heatCapacity ?? 0,
      auxPowerCapacity:      reactor?.system?.bankCapacity ?? 0,
      reserveMultiplier:     reactor?.system?.reserveMultiplier ?? 0,
      overclockBaseDC:       reactor?.system?.overclockBaseDC ?? null,
    };
  };

  // ── 0b. Register Handlebars helpers used by core templates ───────────────
  // The core module uses {{add a b}} in captain/ordnance leadership partials.
  // SF2e registers this helper; dnd5e does not.  Guard against double-registration
  // in case Foundry adds it in a future version.
  if (!Handlebars.helpers["add"]) {
    Handlebars.registerHelper("add", (a, b) => Number(a) + Number(b));
  }

  // ── 0c. Set default artwork for dnd5e document-creation dialogs ──────────
  // CONFIG.DND5E.defaultArtwork is populated by the dnd5e system before module
  // "init" hooks run.  Extending it here gives new ship actors and ship
  // components the vehicle icon instead of the generic actor/item placeholder,
  // and drives the type-card icon in dnd5e's CreateDocumentDialog.
  const COMPONENT_ICON = SHIP_ICON;
  if (CONFIG.DND5E?.defaultArtwork) {
    CONFIG.DND5E.defaultArtwork.Actor ??= {};
    CONFIG.DND5E.defaultArtwork.Item  ??= {};
    CONFIG.DND5E.defaultArtwork.Actor[SHIP_TYPE]     = SHIP_ICON;
    CONFIG.DND5E.defaultArtwork.Actor[NPC_SHIP_TYPE] = SHIP_ICON;
    CONFIG.DND5E.defaultArtwork.Actor[ORDNANCE_TYPE] = SHIP_ICON;
    CONFIG.DND5E.defaultArtwork.Item[COMPONENT_TYPE] = COMPONENT_ICON;
  }

  // ── 1. Register data models ───────────────────────────────────────────────
  CONFIG.Actor.dataModels[SHIP_TYPE]     = ShipModel;
  CONFIG.Actor.typeLabels[SHIP_TYPE]     = `TYPES.Actor.${SHIP_TYPE}`;
  CONFIG.Actor.dataModels[NPC_SHIP_TYPE] = NpcShipModel;
  CONFIG.Actor.typeLabels[NPC_SHIP_TYPE] = `TYPES.Actor.${NPC_SHIP_TYPE}`;
  CONFIG.Actor.dataModels[ORDNANCE_TYPE] = ShipOrdnanceModel;
  CONFIG.Actor.typeLabels[ORDNANCE_TYPE] = `TYPES.Actor.${ORDNANCE_TYPE}`;
  CONFIG.Item.dataModels[COMPONENT_TYPE] = ShipComponentModel;
  CONFIG.Item.typeLabels[COMPONENT_TYPE] = `TYPES.Item.${COMPONENT_TYPE}`;

  // ── 2. Build sheet classes (deferred until Actor5e is on CONFIG) ─────────
  // Actor5e is assigned to CONFIG.Actor.documentClass during dnd5e's "init"
  // hook, which fires before module "init" hooks.  By the time our "init"
  // runs, CONFIG.Actor.documentClass is guaranteed to be Actor5e.
  const NPCActorSheet = globalThis.dnd5e?.applications?.actor?.NPCActorSheet;
  if (!NPCActorSheet) {
    console.error(
      `${MODULE_ID} | dnd5e.applications.actor.NPCActorSheet not found. ` +
      "Is the dnd5e system active?"
    );
    return;
  }

  const ItemSheet5e = globalThis.dnd5e?.applications?.item?.ItemSheet5e;
  if (!ItemSheet5e) {
    console.error(`${MODULE_ID} | dnd5e.applications.item.ItemSheet5e not found.`);
    return;
  }

  StarshipSubtypePrompt = buildStarshipSubtypePrompt();

  const PlayerShipSheet = buildPlayerShipSheet(NPCActorSheet, StarshipClassificationConfig.build(), StarshipMovementConfig.build(), StarshipHitPointsConfig.build(), StarshipArmorClassConfig.build());
  const NpcShipSheet    = buildNpcShipSheet(NPCActorSheet);
  const OrdnanceSheet   = buildOrdnanceSheet(NPCActorSheet, OrdnanceArmorClassConfig.build());
  const ShipComponentSheet = buildShipComponentSheet(ItemSheet5e);

  // ── 3. Register sheets — one default sheet per actor type ────────────────
  // With one type per ship role, Foundry's native per-type sheet resolution
  // does all the routing: no sheet-class flags, no mode-switch hooks.
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    PlayerShipSheet,
    {
      types: [SHIP_TYPE],
      makeDefault: true,
      label: "SHIPCOMBAT.DND5E.Sheet.PlayerShip",
    }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    NpcShipSheet,
    {
      types: [NPC_SHIP_TYPE],
      makeDefault: true,
      label: "SHIPCOMBAT.DND5E.Sheet.NpcShip",
    }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Actor,
    MODULE_ID,
    OrdnanceSheet,
    {
      types: [ORDNANCE_TYPE],
      makeDefault: true,
      label: "SHIPCOMBAT.DND5E.Sheet.Ordnance",
    }
  );
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    Item,
    MODULE_ID,
    ShipComponentSheet,
    {
      types: [COMPONENT_TYPE],
      makeDefault: true,
      label: "SHIPCOMBAT.DND5E.Sheet.Component",
    }
  );

  const ActorClass = CONFIG.Actor.documentClass;

  // ── 4. Ensure dnd5e's per-prepare cache reset runs for our subtypes ──────
  // Actor5e.prepareData() short-circuits for actors whose system model is
  // provided by a module (`system.modelProvider !== dnd5e`), skipping
  // _clearCachedValues() — `sourcedItems` then stays undefined and dnd5e's own
  // "ready" hook crashes on `actor.sourcedItems._redirectKeys()`.  Replicate
  // the native per-prepare reset for our types (also covers legacy
  // "starship"-typed actors that predate the type split, until migration runs).
  const origPrepareData = ActorClass.prototype.prepareData;
  ActorClass.prototype.prepareData = function(...args) {
    if (typeof this.type === "string" && this.type.startsWith(`${MODULE_ID}.`)) {
      this._clearCachedValues?.();
    }
    return origPrepareData.apply(this, args);
  };

  // ── 5. Collapse the Create Actor dialog to a single "Starship" entry ─────
  // npcShip and shipOrdnance are hidden from the type list; picking "Starship"
  // (the `ship` type) opens a follow-up Player / NPC / Ordnance prompt that
  // retypes the freshly created actor before its sheet is opened.
  const origCreateDialog = ActorClass.createDialog;
  ActorClass.createDialog = async function(data = {}, createOptions = {}, dialogOptions = {}, ...rest) {
    const restricted = dialogOptions?.types ?? createOptions?.types;
    // Only collapse when the caller didn't constrain the type list or
    // preselect a type — explicit requests know what they want.
    if (restricted || data.type) {
      return origCreateDialog.call(this, data, createOptions, dialogOptions, ...rest);
    }

    const types = this.TYPES.filter(t =>
      t !== CONST.BASE_DOCUMENT_TYPE && t !== NPC_SHIP_TYPE && t !== ORDNANCE_TYPE
    );

    // dnd5e's Actor5e.createDialog reads `types` and `renderSheet` from its
    // second parameter (CreateDocumentDialog.prompt destructures them there);
    // core's ClientDocument.createDialog reads `types` from the third.  Set
    // both so the wrapper works regardless of the underlying implementation.
    // renderSheet is suppressed because a "Starship" pick's final type isn't
    // known until the subtype prompt resolves — we render manually below.
    const created = await origCreateDialog.call(
      this,
      data,
      { ...createOptions, types, renderSheet: false },
      { ...dialogOptions, types },
      ...rest
    );
    if (!created) return created;

    let actor = created;
    if (created.type === SHIP_TYPE) {
      const choice  = await promptStarshipSubtype();
      const newType = choice === "npc"      ? NPC_SHIP_TYPE
                    : choice === "ordnance" ? ORDNANCE_TYPE
                    :                         SHIP_TYPE;   // "player" or dismissed
      if (newType !== created.type) {
        // V14 requires the system field to be a ForcedReplacement whenever the
        // type changes.  The actor is brand-new, so replacing with {} simply
        // takes the new type's schema defaults.
        await created.update({
          type:   newType,
          system: foundry.data.operators.ForcedReplacement.create({}),
        });
        actor = game.actors?.get(created.id) ?? created;
      }
    }
    actor.sheet?.render(true);
    return actor;
  };

  console.log(`${MODULE_ID} | actor types registered (ship / npcShip / shipOrdnance), sheets wired.`);

  // ── 6. Register partial overrides ─────────────────────────────────────────
  // Only the component-extended-fields partial is needed — the actor sheets
  // use native dnd5e NPC templates directly and don't use ship-header or
  // npc-ship-header partials.
  ShipCombat.registerPartialOverride(
    "component-extended-fields",
    `modules/${MODULE_ID}/templates/item/component-extended-fields.hbs`
  );

  // ── 7. Combat-tracker initiative for ship actors (ported from SF2e) ───────
  // The tracker's "roll initiative" path knows nothing about ship actors:
  // player ships roll d20 + the captain's initiative skill, NPC ships roll
  // d20 + their own PIL modifier.
  const CombatCls = CONFIG.Combat.documentClass;
  const _origRollInitiative = CombatCls.prototype.rollInitiative;
  CombatCls.prototype.rollInitiative = async function (ids, options) {
    const combatantIds = Array.isArray(ids) ? ids : [ids];
    const shipIds    = [];
    const npcShipIds = [];
    const otherIds   = [];
    for (const id of combatantIds) {
      const actor = this.combatants.get(id)?.actor;
      if (actor?.type === SHIP_TYPE)          shipIds.push(id);
      else if (actor?.type === NPC_SHIP_TYPE) npcShipIds.push(id);
      else otherIds.push(id);
    }

    const { SystemAdapter } = globalThis.ShipCombat._api;
    const adapter = SystemAdapter.current;

    // Player ships: d20 + the captain's initiative skill modifier
    // (mirrors the portrait click handler on PlayerShipSheet).
    for (const id of shipIds) {
      const combatant = this.combatants.get(id);
      const ship      = combatant?.actor;
      if (!ship) continue;

      const sys = ship.system;
      let crewActor = null;
      const captainRef = sys.crewActors?.captain;
      if (captainRef?.uuid) {
        try { crewActor = await fromUuid(captainRef.uuid); } catch { /* ignore */ }
      }
      if (!crewActor) {
        const entry = Object.entries(sys.roles ?? {}).find(([, r]) => r === "captain");
        if (entry) crewActor = game.users.get(entry[0])?.character ?? null;
      }
      if (!crewActor) {
        ui.notifications.warn(game.i18n.localize("SHIPCOMBAT.Warning.NoCaptainAssigned"));
        continue;
      }

      const roleSkill = sys.roleSkillOverrides?.captain ?? "leadership";
      const { total } = await adapter.rollShipInitiative(crewActor, roleSkill, {
        flavor:  game.i18n.localize("SHIPCOMBAT.Captain.RollInitiativeBtn"),
        speaker: ChatMessage.getSpeaker({ actor: crewActor }),
      });
      await this.setInitiative(id, adapter.toCombatantInitiative(total, ship));
    }

    // NPC ships: d20 + PIL modifier from the ship's own attributes.
    for (const id of npcShipIds) {
      const combatant = this.combatants.get(id);
      const ship = combatant?.actor;
      if (!ship) continue;
      const piloting = ship.system?.attributes?.piloting ?? 0;
      const { total } = await adapter.rollShipInitiativeFromAttribute(
        piloting,
        game.i18n.localize("SHIPCOMBAT.NpcShip.RollInitiative"),
        { speaker: ChatMessage.getSpeaker({ actor: ship }) },
      );
      await this.setInitiative(id, adapter.toCombatantInitiative(total, ship));
    }

    if (otherIds.length > 0) {
      return _origRollInitiative.call(this, otherIds, options);
    }
    return this;
  };
});

// ── New NPC ships start with d20 attribute modifiers of 0 (ported from SF2e) ─
// Core's NpcShipSchema defaults piloting/tech/gunnery to 40 (d100 target
// numbers); in a d20 system they are flat roll modifiers.
Hooks.on("preCreateActor", (actor, _data, _options, _userId) => {
  if (actor.type === NPC_SHIP_TYPE) {
    actor.updateSource({
      "system.attributes.piloting": 0,
      "system.attributes.tech":     0,
      "system.attributes.gunnery":  0,
    });
  }
});

// ── Default component icon ───────────────────────────────────────────────
// Core's own preCreateItem hook (causodes-shipcombat-core.js) unconditionally
// stamps "icons/svg/levels.svg" onto new component items whenever the raw
// creation data lacks an img — it runs before this module's hook and reads
// the ORIGINAL data.img, so CONFIG.DND5E.defaultArtwork.Item alone (set
// above in "0c") never reaches newly-created items. Re-override afterward,
// same pattern as the SF2e/impmal companions.
Hooks.on("preCreateItem", (item, data, _options, _userId) => {
  if (item.type !== COMPONENT_TYPE) return;
  if (!data.img || data.img === foundry.documents.BaseItem.DEFAULT_ICON || data.img === "icons/svg/levels.svg") {
    item.updateSource({ img: SHIP_ICON });
  }
});

// ── ready hook — one-time migration of legacy unified "starship" actors ─────
// Worlds created before the type split hold actors of type
// "causodes-shipcombat-dnd5e.starship" with a system.shipMode discriminator.
// Retype each one to the matching split type.  GM-only (document writes).
//
// NOTE: since "starship" is no longer a registered sub-type, Foundry treats
// these actors as INVALID documents — they are excluded from normal collection
// iteration and only reachable via game.actors.invalidDocumentIds/getInvalid.
Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  const legacy = game.actors.filter(a => a.type === LEGACY_STARSHIP_TYPE);
  for (const id of game.actors.invalidDocumentIds ?? []) {
    let actor = null;
    try { actor = game.actors.getInvalid(id); } catch { /* unrecoverable source */ }
    if (actor?.type === LEGACY_STARSHIP_TYPE) legacy.push(actor);
  }
  if (!legacy.length) return;

  const MODE_TO_TYPE = {
    player:   SHIP_TYPE,
    npc:      NPC_SHIP_TYPE,
    ordnance: ORDNANCE_TYPE,
  };
  // Legacy unified traits carried the ordnance weapon-trait keys on every
  // actor; ship/npcShip trait schemas no longer include them.
  const ORDNANCE_TRAIT_KEYS = ["rend", "armourPenetration", "shieldBurn", "shieldBypass"];

  console.log(`${MODULE_ID} | migrating ${legacy.length} legacy starship actor(s) to split actor types`);
  let migrated = 0;
  for (const actor of legacy) {
    try {
      const src     = actor._source?.system ?? {};
      const mode    = src.shipMode ?? "player";
      const newType = MODE_TO_TYPE[mode] ?? SHIP_TYPE;

      const system = foundry.utils.deepClone(src);
      delete system.shipMode;

      // Drop top-level keys the new type's schema doesn't declare.
      const NewModel  = CONFIG.Actor.dataModels[newType];
      const knownKeys = new Set(Object.keys(NewModel.schema.fields));
      for (const key of Object.keys(system)) {
        if (!knownKeys.has(key)) delete system[key];
      }
      if (newType !== ORDNANCE_TYPE && system.traits) {
        for (const key of ORDNANCE_TRAIT_KEYS) delete system.traits[key];
      }
      if (newType === NPC_SHIP_TYPE) {
        // The legacy unified schema stored resources as a free-form ObjectField
        // (player-crew role allocations); the NPC schema declares a structured
        // pilot/gunner SchemaField.  Drop the blob and take schema defaults —
        // NPC resources are transient per-round combat state.
        delete system.resources;
      }
      if (newType === ORDNANCE_TYPE) {
        // Unified actors carried ship-sized hull defaults (50/50); ordnance
        // hull is the warhead/flight count — reset to the schema default.
        system.hull = { value: 1, max: 1 };
      }

      // V14 requires the system field to be a ForcedReplacement whenever the
      // type changes — this also replaces the stored system wholesale instead
      // of merging into the legacy data.
      await actor.update({
        type:   newType,
        system: foundry.data.operators.ForcedReplacement.create(system),
      });

      // Clear the old mode-switch machinery's sheet-class flag — the split
      // types resolve their sheets natively.  Done after the retype so the
      // write goes through a valid document; best-effort (a stale flag only
      // points at a sheet class no longer registered for the type, which
      // falls back to the correct per-type default anyway).
      try {
        const fresh = game.actors.get(actor.id);
        if (fresh?.getFlag("core", "sheetClass")) await fresh.unsetFlag("core", "sheetClass");
      } catch { /* cosmetic */ }
      migrated++;
      console.log(`${MODULE_ID} | migrated "${actor.name}" (${actor.id}) → ${newType}`);
    } catch (err) {
      console.error(`${MODULE_ID} | failed to migrate legacy starship actor "${actor.name}" (${actor.id})`, err);
    }
  }
  if (migrated) {
    ui.notifications?.info(
      `Ship Combat (D&D5e): migrated ${migrated} starship actor(s) to the new split actor types.`
    );
  }
});
