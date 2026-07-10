/**
 * ShipModel — data model for the "causodes-shipcombat-dnd5e.ship" actor type
 * (the player-crewed starship).
 *
 * Extends core's ShipSchemaMixin, which defines the full ship-combat schema
 * (hull, shields, armour, slots, resources, movement, …).  The `_Base` class
 * supplies the dnd5e NPC-sheet compatibility stubs from dnd5e-compat.js
 * (attributes.hp/ac, traits IWR sets, details, bonuses, currency) expected by
 * the native dnd5e NPC UI the PlayerShipSheet is built on.
 *
 * Hull convention (hullDisplayMode = "hpRemaining"):
 *   hull.value = REMAINING hull points  ↔  system.attributes.hp.value
 *   hull.max   = maximum hull points    ↔  system.attributes.hp.max
 */

import {
  dnd5eShipStubSchema,
  mirrorHullToHp,
  computeComponentAC,
  prepareTravelSpeeds,
} from "../dnd5e-compat.js";

const { ShipSchemaMixin } = globalThis.ShipCombat._api;

class _Base extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return dnd5eShipStubSchema();
  }

  /**
   * Wire core's preparation pipeline: computeBase() calls
   * SystemAdapter.current.initModelStubs(this) so the NPC sheet gets the
   * dnd5e-expected stubs (abilities, skills, resources sub-keys).
   * @override
   */
  prepareBaseData() {
    super.prepareBaseData?.();
    this.computeBase();
  }

  /** @override */
  prepareDerivedData() {
    // Run core's derivation pipeline first (movement from engine, armour sum, etc.).
    this.computeDerived();
    mirrorHullToHp(this);
    computeComponentAC(this);
    prepareTravelSpeeds(this);
  }
}

export class ShipModel extends ShipSchemaMixin(_Base) {}
