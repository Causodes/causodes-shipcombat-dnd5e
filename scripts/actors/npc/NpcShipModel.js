/**
 * NpcShipModel — data model for the "causodes-shipcombat-dnd5e.npcShip"
 * actor type.
 *
 * Extends core's NpcShipSchemaMixin, which defines the NPC ship engine schema
 * (conditions, armourRend, ammoTracks, resources.pilot/gunner, attributes
 * piloting/tech/gunnery, …) that core's round-upkeep loops and the NPC tab
 * templates read/write.  The `_Base` class supplies the dnd5e NPC-sheet
 * compatibility stubs (attributes.hp/ac, traits, details, bonuses, currency).
 *
 * NpcShipSchemaMixin replaces `attributes` wholesale with its own
 * piloting/tech/gunnery block, so defineSchema() below re-merges the dnd5e
 * attribute stubs into it — both field sets coexist under system.attributes.
 */

import {
  dnd5eShipStubSchema,
  dnd5eAttributeStubFields,
  extendSchemaField,
  mirrorHullToHp,
  computeComponentAC,
  prepareTravelSpeeds,
} from "../dnd5e-compat.js";

const { NpcShipSchemaMixin } = globalThis.ShipCombat._api;

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
    computeComponentAC(this);
    prepareTravelSpeeds(this);
  }
}

export class NpcShipModel extends NpcShipSchemaMixin(_Base) {
  /** @override */
  static defineSchema() {
    const schema = super.defineSchema();
    // NpcShipSchemaMixin overwrote _Base's attributes with piloting/tech/gunnery;
    // extend its SchemaField with the dnd5e stubs (hp, ac, init, spell,
    // concentration, travel, price, capacity) so both coexist. Keep the
    // existing SchemaField and extend it through the V13/V14 compatibility
    // helper because the mixin's sub-fields are already bound to it.
    extendSchemaField(schema.attributes, dnd5eAttributeStubFields());
    return schema;
  }
}
