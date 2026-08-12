/**
 * ShipOrdnanceModel — data model for the "causodes-shipcombat-dnd5e.shipOrdnance"
 * actor type (unified torpedo + strike craft).
 *
 * Extends core's OrdnanceSchemaMixin, which defines the full ordnance schema
 * including the `subtype` discriminator ("torpedo" | "strikeCraft"), hull
 * (1/1 = one warhead/flight unit by default; spawnOrdnance overrides with the
 * salvo/flight size), fuel, ammo, helm, and the payload fields.  The `_Base`
 * class supplies the dnd5e NPC-sheet compatibility stubs the OrdnanceSheet's
 * native dnd5e chrome expects.
 *
 * OrdnanceSchemaMixin replaces `traits` wholesale with its weapon-trait block
 * (rend, armourPenetration, shieldBurn, shieldBypass), so defineSchema() below
 * re-merges the dnd5e trait stubs (IWR sets, size, weight/keel/beam) into it.
 */

import {
  dnd5eShipStubSchema,
  dnd5eTraitStubFields,
  mirrorHullToHp,
  prepareTravelSpeeds,
} from "../dnd5e-compat.js";

const { OrdnanceSchemaMixin } = globalThis.ShipCombat._api;

class _Base extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return dnd5eShipStubSchema();
  }

  /** @override */
  prepareBaseData() {
    super.prepareBaseData?.();
    this.computeBase();
  }

  /** @override */
  prepareDerivedData() {
    this.computeDerived();
    mirrorHullToHp(this);
    // Ordnance AC is authored on system.armorClass (edited via
    // OrdnanceArmorClassConfig); mirror it into attributes.ac so the native
    // header display and Dnd5eAdapter.getTargetAC (which reads
    // attributes.ac.value on every target) both see it.
    const ac = this.armorClass ?? 10;
    this.attributes.ac.flat  = ac;
    this.attributes.ac.value = ac;
    prepareTravelSpeeds(this);
  }
}

export class ShipOrdnanceModel extends OrdnanceSchemaMixin(_Base) {
  /** @override */
  static defineSchema() {
    const schema = super.defineSchema();
    // OrdnanceSchemaMixin overwrote _Base's traits with the weapon-trait block;
    // extend its SchemaField with the dnd5e stubs (dr/di/dv/dm/ci pills,
    // important, size, weight/keel/beam) so both coexist.  extendFields is
    // required here — the mixin's sub-fields are already bound to their
    // SchemaField and may not be spread into a new one.
    schema.traits.extendFields(dnd5eTraitStubFields());
    return schema;
  }
}
