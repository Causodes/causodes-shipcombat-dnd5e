/**
 * dnd5e-compat.js — shared dnd5e NPC-sheet compatibility layer for the three
 * ship actor data models (ship, npcShip, shipOrdnance).
 *
 * All three sheets extend dnd5e's NPCActorSheet, whose context builders and
 * templates read a set of creature/vehicle fields (attributes.hp/ac, traits
 * IWR sets, details.biography, bonuses, currency, …) that are not part of the
 * core ship-combat schemas.  Each model composes these stubs into its schema
 * via `dnd5eShipStubSchema()` and calls the shared prepare helpers from
 * prepareDerivedData().
 *
 * Hull convention (hullDisplayMode = "hpRemaining"):
 *   hull.value = REMAINING hull points  ↔  system.attributes.hp.value
 *   hull.max   = maximum hull points    ↔  system.attributes.hp.max
 */

const MODULE_ID = "causodes-shipcombat-dnd5e";

// FormulaField is a dnd5e-specific field type, not part of core foundry.data.fields.
// Resolved lazily (inside defineSchema, not at module import time) since dnd5e's
// globalThis.dnd5e may not be populated yet when this module is first evaluated.
function getFormulaField() {
  return globalThis.dnd5e?.dataModels?.fields?.FormulaField ?? foundry.data.fields.StringField;
}

/** Mirrors dnd5e's internal `makeAttackBonuses()` (CreatureTemplate bonuses schema). */
function makeAttackBonuses() {
  const FormulaField = getFormulaField();
  return new foundry.data.fields.SchemaField({
    attack: new FormulaField({ required: true }),
    damage: new FormulaField({ required: true }),
  });
}

/**
 * dnd5e NPC-sheet-compatible `attributes` sub-fields (hp, ac, init, spell,
 * concentration, travel, price, capacity).  Returned as a plain field map so
 * models can either wrap it in a SchemaField directly or merge it with the
 * attribute fields a core schema mixin defines (NpcShipSchemaMixin defines
 * its own attributes block with piloting/tech/gunnery).
 */
export function dnd5eAttributeStubFields() {
  const fields = foundry.data.fields;
  return {
    // HP — 5e uses HP, not wounds.  hull.value is REMAINING HP.
    // NOTE: intentionally omits "bonuses" (level/overall formula strings)
    // that CharacterData adds.  HitPointsConfig reads context.fields.bonuses
    // to decide whether to show the class-based calculation view; having no
    // bonuses field keeps the simple max / temp / value view (matching NPCs).
    hp: new fields.SchemaField({
      value:   new fields.NumberField({ initial: 50, min: 0, integer: true, nullable: false, label: "DND5E.HitPointsCurrent" }),
      max:     new fields.NumberField({ initial: 50, min: 1, integer: true, nullable: false, label: "DND5E.HitPointsMax" }),
      temp:    new fields.NumberField({ initial: 0,  min: 0, integer: true, nullable: false }),
      tempmax: new fields.NumberField({ initial: 0,  min: 0, integer: true, nullable: false }),
      // FormulaField renders a formula-editor input (with the λ button) in
      // Foundry V14+.  Falls back to StringField if dnd5e is unavailable.
      formula: new (getFormulaField())({ initial: "", label: "DND5E.HPFormula" }),
    }),
    // AC — computed from installed armour + engine components (ships) or
    // mirrored from system.armorClass (ordnance).
    // calc is always "flat" for ships; value mirrors flat for display.
    // The native ArmorClassConfig needs calc/formula/value to render
    // without NaN or a broken formula section.
    ac: new fields.SchemaField({
      flat:    new fields.NumberField({ initial: 0, integer: true, nullable: true,  label: "DND5E.ArmorClassFlat" }),
      calc:    new fields.StringField({ initial: "flat", nullable: false,          label: "DND5E.ArmorClassCalculation" }),
      formula: new fields.StringField({ initial: "", blank: true, nullable: false, label: "DND5E.ArmorClassFormula" }),
      value:   new fields.NumberField({ initial: 0, integer: true, nullable: false }),
    }),
    // Initiative — NPC sheet expects this to exist even if unused.
    init: new fields.SchemaField({
      value: new fields.NumberField({ initial: 0, integer: true, nullable: false }),
    }),
    // Spellcasting stubs — the sheets inherit native NPC context builders.
    // NPCActorSheet._prepareSpellsContext reads attributes.spell.level (as a
    // fallback when there's no spellcasting class) and attributes.concentration.save
    // unconditionally; both crash if their parent object is missing entirely.
    spell: new fields.SchemaField({
      level: new fields.NumberField({ initial: 0, integer: true, min: 0, nullable: false }),
    }),
    concentration: new fields.SchemaField({
      save: new fields.NumberField({ initial: 0, integer: true, nullable: false }),
    }),
    // Travel speed — use dnd5e's TravelField for full per-type speed/pace/time
    // support (Land / Water / Air, Hours per Day, Travel Pace).  Falls back to a
    // minimal SchemaField if TravelField is somehow not yet available.
    travel: (() => {
      const TravelField = globalThis.dnd5e?.dataModels?.actor?.TravelField;
      return TravelField
        ? new TravelField({}, { initialTime: 8, initialUnits: null })
        : new fields.SchemaField({
            speeds: new fields.SchemaField({ max: new fields.NumberField({ initial: null, min: 0, nullable: true }) }),
            paces:  new fields.SchemaField({ max: new fields.NumberField({ initial: null, min: 0, nullable: true }) }),
            units:  new fields.StringField({ initial: "mi", nullable: false }),
          });
    })(),
    // Price (mirrors Vehicle's attributes.price schema).
    price: new fields.SchemaField({
      value:        new fields.NumberField({ initial: null, min: 0, integer: true, nullable: true }),
      denomination: new fields.StringField({ initial: "gp", nullable: false }),
    }),
    // Cargo capacity (mirrors Vehicle's attributes.capacity.cargo).
    capacity: new fields.SchemaField({
      cargo: new fields.SchemaField({
        value: new fields.NumberField({ initial: null, min: 0, nullable: true }),
        units: new fields.StringField({ initial: "lb", nullable: false }),
      }),
    }),
  };
}

/**
 * dnd5e trait sub-fields (IWR sets, damage modification, condition immunities,
 * size, physical dimensions).  Field shapes parallel the dnd5e NPC actor trait
 * schema so the sidebar's trait pills (and modifyDamageForType) work correctly.
 * Returned as a plain field map so the ordnance model can merge it with the
 * weapon-trait block OrdnanceSchemaMixin defines (rend/AP/shieldBurn/shieldBypass).
 */
export function dnd5eTraitStubFields() {
  const fields = foundry.data.fields;
  return {
    // Damage resistances (type slugs) — halve incoming damage of that type.
    dr: new fields.SchemaField({
      value:    new fields.SetField(new fields.StringField()),
      custom:   new fields.StringField({ initial: "" }),
      bypasses: new fields.SetField(new fields.StringField()),
    }),
    // Damage immunities — fully negate incoming damage of that type.
    di: new fields.SchemaField({
      value:    new fields.SetField(new fields.StringField()),
      custom:   new fields.StringField({ initial: "" }),
      bypasses: new fields.SetField(new fields.StringField()),
    }),
    // Damage vulnerabilities — double incoming damage of that type.
    dv: new fields.SchemaField({
      value:    new fields.SetField(new fields.StringField()),
      custom:   new fields.StringField({ initial: "" }),
      bypasses: new fields.SetField(new fields.StringField()),
    }),
    // Damage modification — formula string per damage type ("lambda").
    // Evaluated via Roll after resistance/vulnerability are applied.
    dm: new fields.SchemaField({
      amount:   new fields.ObjectField({ initial: {} }),   // { [typeSlug]: formulaString }
      bypasses: new fields.SetField(new fields.StringField()),
    }),
    // Condition immunities.
    ci: new fields.SchemaField({
      value:  new fields.SetField(new fields.StringField()),
      custom: new fields.StringField({ initial: "" }),
    }),
    // Important NPC flag — read by NPCActorSheet for death-save / loyalty display.
    important: new fields.BooleanField({ initial: false }),
    // Actor size — mirrors CONFIG.actorSizes keys (tiny/sm/med/lg/huge/grg).
    size: new fields.StringField({ initial: "lg", nullable: false }),
    // Physical dimensions (from Vehicle's traits schema).
    weight: new fields.SchemaField({
      value: new fields.NumberField({ initial: null, min: 0, nullable: true }),
      units: new fields.StringField({ initial: "lb", nullable: false }),
    }),
    keel: new fields.SchemaField({
      value: new fields.NumberField({ initial: null, min: 0, nullable: true }),
      units: new fields.StringField({ initial: "ft", nullable: false }),
    }),
    beam: new fields.SchemaField({
      value: new fields.NumberField({ initial: null, min: 0, nullable: true }),
      units: new fields.StringField({ initial: "ft", nullable: false }),
    }),
  };
}

/**
 * Full dnd5e compatibility stub schema shared by all three ship models:
 * attributes, traits, details, crew/passenger counts, bonuses, currency.
 *
 * Core schema mixins that define their own `attributes` (NpcShipSchemaMixin)
 * or `traits` (OrdnanceSchemaMixin) overwrite those keys via
 * super.defineSchema(); the concrete models re-merge the stub sub-fields in
 * their own defineSchema() override.
 */
export function dnd5eShipStubSchema() {
  const fields = foundry.data.fields;
  const FormulaField = getFormulaField();
  return {
    attributes: new fields.SchemaField(dnd5eAttributeStubFields()),
    traits:     new fields.SchemaField(dnd5eTraitStubFields()),

    // ── Ship / vehicle identity ──────────────────────────────────────────
    details: new fields.SchemaField({
      // Shown under the name in view mode.
      classification: new fields.StringField({ initial: "" }),
      model:          new fields.StringField({ initial: "" }),
      // NPC-ship faction / role labels (displayed in the NPC sheet header).
      shipFaction:    new fields.StringField({ initial: "" }),
      shipRole:       new fields.StringField({ initial: "" }),
      // Biography — read by NPCActorSheet for the biography tab and limited view.
      biography: new fields.SchemaField({
        value:  new fields.HTMLField({ initial: "" }),
        public: new fields.HTMLField({ initial: "" }),
      }),
      // Habitat — read by NPCActorSheet._prepareSidebarContext.
      // Ships have no habitat; stub prevents a crash on property access.
      habitat: new fields.SchemaField({
        value:  new fields.ArrayField(new fields.StringField()),
        custom: new fields.StringField({ initial: "" }),
      }),
      // CR/XP badge — NPCActorSheet._renderFrame() unconditionally injects a
      // ".cr-xp" element into every actor sheet's title bar (regardless of
      // PARTS), and _onRender() reads details.xp.value to populate it.
      xp: new fields.SchemaField({
        value: new fields.NumberField({ initial: null, nullable: true }),
      }),
    }),

    // ── Crew / passenger counts ──────────────────────────────────────────
    // Numeric min/max displayed in the sidebar (distinct from core's
    // crew-actor assignment data in the ship schema).
    crew: new fields.SchemaField({
      min: new fields.NumberField({ initial: null, min: 0, integer: true, nullable: true }),
      max: new fields.NumberField({ initial: null, min: 0, integer: true, nullable: true }),
    }),
    passengers: new fields.SchemaField({
      max: new fields.NumberField({ initial: null, min: 0, integer: true, nullable: true }),
    }),

    // ── dnd5e NPC-sheet compatibility stubs ───────────────────────────────
    // These fields are not used by the ship combat engine but are read by
    // NPCActorSheet template helpers and must exist in _source to prevent
    // TypeErrors in the inherited sheet context builders.

    // Global bonus formulas — BaseActorSheet._prepareSpecialTraitsContext
    // iterates schema.fields.bonuses, and NPCActorSheet._prepareSpellsContext
    // reads bonuses.msak.attack / bonuses.rsak.attack directly (crashes if
    // those sub-schemas are absent).  Mirrors dnd5e's CreatureTemplate
    // bonuses schema so both call sites resolve to blank formulas.
    bonuses: new fields.SchemaField({
      mwak: makeAttackBonuses(),
      rwak: makeAttackBonuses(),
      msak: makeAttackBonuses(),
      rsak: makeAttackBonuses(),
      abilities: new fields.SchemaField({
        check: new FormulaField({ required: true }),
        save:  new FormulaField({ required: true }),
        skill: new FormulaField({ required: true }),
      }),
      spell: new fields.SchemaField({
        dc: new FormulaField({ required: true, deterministic: true }),
      }),
    }),

    // Currency — BaseActorSheet._prepareInventoryContext reads _source.currency[k].
    // Ships may legitimately hold treasure / cargo funds.
    currency: new fields.SchemaField({
      pp: new fields.NumberField({ initial: 0, min: 0, integer: true, nullable: false }),
      gp: new fields.NumberField({ initial: 0, min: 0, integer: true, nullable: false }),
      ep: new fields.NumberField({ initial: 0, min: 0, integer: true, nullable: false }),
      sp: new fields.NumberField({ initial: 0, min: 0, integer: true, nullable: false }),
      cp: new fields.NumberField({ initial: 0, min: 0, integer: true, nullable: false }),
    }),
  };
}

/**
 * Mirror hull.value / hull.max into attributes.hp so the inherited dnd5e
 * NPC sheet HP display stays consistent with core's hull engine, and stub
 * initiative so the header never renders NaN.
 *
 * hullDisplayMode = "hpRemaining":
 *   hull.value = REMAINING hull points  ↔  attributes.hp.value
 *   hull.max   = maximum hull points    ↔  attributes.hp.max
 */
export function mirrorHullToHp(model) {
  // hull is defined by the core schema mixin; skip on first prepare if not yet set.
  if (!model.hull) return;
  model.attributes.hp.value = Math.max(0, model.hull.value ?? 0);
  model.attributes.hp.max   = Math.max(1, model.hull.max   ?? 50);
  // effectiveMax = max adjusted by temporary-max modifier; the native
  // npc-header.hbs reads hp.effectiveMax for the "X / Y" display and the
  // HP bar percentage.  Without this it renders as NaN.
  const hp = model.attributes.hp;
  hp.effectiveMax = Math.max(0, hp.max + (hp.tempmax ?? 0));
  hp.value = Math.min(hp.value, hp.effectiveMax);
  hp.damage = hp.effectiveMax - hp.value;
  hp.pct = Math.clamp(hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0, 0, 100);
  // Ships have no ability-based initiative; always 0 (avoids NaN in the header).
  model.attributes.init.total = model.attributes.init.value ?? 0;
}

/**
 * Sum the AC contribution of every equipped armour and engine component into
 * attributes.ac. Used by the ship and npcShip models (ordnance mirrors
 * system.armorClass instead).
 */
export function computeComponentAC(model) {
  const acSum = (model.parent?.items ?? []).reduce((sum, item) => {
    if (item.type !== `${MODULE_ID}.component`) return sum;
    // Only equipped components contribute AC (equipped defaults to true; an
    // unequipped component sits in inventory and must not count).
    if (item.system?.equipped === false) return sum;
    const slot = item.system?.slot;
    if (slot !== "armour" && slot !== "engine") return sum;
    const contrib = slot === "armour"
      ? (item.system?.acContributionArmor  ?? 0)
      : (item.system?.acContributionEngine ?? 0);
    return sum + contrib;
  }, 0);
  model.attributes.ac.flat  = acSum;
  model.attributes.ac.value = acSum;
}

/**
 * Derive travel speed maximums (speeds.max, paces.max) from per-type values
 * via dnd5e's TravelField.prepareData.
 */
export function prepareTravelSpeeds(model) {
  const TravelField = globalThis.dnd5e?.dataModels?.actor?.TravelField;
  if (!TravelField || !model.attributes?.travel) return;
  try {
    const rollData = model.parent.getRollData({ deterministic: true });
    TravelField.prepareData.call(model, rollData);
  } catch (e) { /* ignore — parent may not be ready on first prepare */ }
}
