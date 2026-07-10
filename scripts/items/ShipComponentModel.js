/**
 * ShipComponentModel — data model for "causodes-shipcombat-dnd5e.component" items.
 *
 * Extends ShipComponentSchemaMixin with 5e-specific fields that live alongside
 * (but don't duplicate) core's free-text `damage` and `damageType` fields:
 *   - diceCount / dieSize: structured damage dice for formula building.
 *   - acContributionArmor / acContributionEngine: per-slot AC added to the ship's flat AC.
 *
 * NOTE: `damageType` is already defined as a StringField by ShipComponentSchemaMixin
 * (the mixin adds it to the schema via `schema.damageType`). Populate it with a
 * key from CONFIG.DND5E.damageTypes (e.g. "piercing", "fire").
 */

const { ShipComponentSchemaMixin } = globalThis.ShipCombat._api;

class _Base extends foundry.abstract.TypeDataModel {
  /**
   * dnd5e ItemSheet5e reads `item.system.constructor.metadata.hasEffects` to
   * decide whether to show an Effects tab. Provide the field so it doesn't crash.
   */
  static metadata = Object.freeze({ hasEffects: false });

  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      // ── Structured damage ────────────────────────────────────────────────
      // Replaces the core's free-text `system.damage` field for 5e.
      diceCount: new fields.NumberField({
        initial: null, integer: true, nullable: true,
      }),
      dieSize: new fields.StringField({
        initial: null,
        choices: { d4: "d4", d6: "d6", d8: "d8", d10: "d10", d12: "d12", d20: "d20" },
        nullable: true,
      }),

      // Flat damage bonus — stored as a string so it can hold formulas ("@prof+2")
      // as well as plain numbers.  Initial: "" renders as blank like the native
      // dnd5e damage bonus field.
      bonus: new fields.StringField({
        initial: "", blank: true, nullable: false,
      }),

      // ── AC contribution (per slot-type) ──────────────────────────────────
      // Separate fields per slot so both armour and engine fieldsets in the
      // sheet template have unique input names, preventing FormDataExtended
      // from appending them into an array that fails NumberField validation.
      acContributionArmor: new fields.NumberField({
        initial: 0, min: 0, integer: true, nullable: true,
      }),
      acContributionEngine: new fields.NumberField({
        initial: 0, min: 0, integer: true, nullable: true,
      }),
      // coreOutput: reactor output (separate from sensor rating to avoid duplicate-name collisions).
      coreOutput: new fields.NumberField({ initial: 0, min: 0, integer: true, nullable: true }),
      // overclockBaseDC: starting DC for overclock checks (scales +10 at max heat).
      overclockBaseDC: new fields.NumberField({ initial: 10, min: 0, integer: true, nullable: true }),
      // Legacy field retained for migrateData only; no longer used by the sheet.
      acContribution: new fields.NumberField({
        initial: null, min: 0, integer: true, nullable: true,
      }),

      // ── Description ─────────────────────────────────────────────────────
      // ItemSheet5e._prepareDescriptionContext reads description.value and
      // description.chat directly (no optional chaining) — must exist.
      description: new fields.SchemaField({
        value: new fields.HTMLField({ initial: "", required: false }),
        chat:  new fields.HTMLField({ initial: "", required: false }),
      }),
    };
  }
}

export class ShipComponentModel extends ShipComponentSchemaMixin(_Base) {
  /**
   * Migrate the legacy single `acContribution` field to the new per-slot
   * fields.  If neither new field exists yet, seed both from the old value.
   * @override
   */
  static migrateData(source) {
    if (typeof super.migrateData === "function") source = super.migrateData(source);
    // One-time migration: copy old flat value into each slot field.
    const legacy = source.acContribution;
    if (Number.isFinite(legacy) && legacy !== 0) {
      source.acContributionArmor  ??= legacy;
      source.acContributionEngine ??= legacy;
    }
    // Coerce a genuinely-present null/NaN (e.g. a cleared input) to 0, but only
    // when the key actually exists in `source`. migrateData also runs on PARTIAL
    // update diffs (Foundry cleans changes with {migrate:true, partial:true} — a
    // toggle like {system.equipped:true} arrives here without the AC keys). If we
    // unconditionally assigned 0, the coercion would inject acContribution* into
    // that diff and overwrite the stored values. A full/new source without the
    // keys is handled by the schema's `initial: 0` instead.
    if ("acContributionArmor" in source && !Number.isFinite(source.acContributionArmor)) {
      source.acContributionArmor = 0;
    }
    if ("acContributionEngine" in source && !Number.isFinite(source.acContributionEngine)) {
      source.acContributionEngine = 0;
    }
    return source;
  }
}
