/**
 * OrdnanceArmorClassConfig — AC configuration popup for Ordnance actors.
 *
 * Extends dnd5e's native ArmorClassConfig (mirroring StarshipArmorClassConfig's
 * approach for the ship) but replaces the template with one that hardcodes
 * "Flat" as the calculation type — no dropdown, since ordnance AC has no
 * other calc mode — while still letting the GM edit the flat value directly.
 * Bound to system.armorClass (the ordnance-specific attack-target AC field),
 * not attributes.ac (the ship's component-summed AC).
 *
 * Built as a factory (.build()) so it can be constructed after dnd5e's "init"
 * hook when the native ArmorClassConfig class is available on globalThis.dnd5e.
 */

const DND5E_MODULE_ID = "causodes-shipcombat-dnd5e";

export class OrdnanceArmorClassConfig {
  /**
   * Build the OrdnanceArmorClassConfigApp class, extending the native
   * dnd5e ArmorClassConfig. Call this during or after the "init" hook.
   * @returns {typeof ApplicationV2|null}  The built class, or null if dnd5e is
   *   not available.
   */
  static build() {
    const ArmorClassConfig = globalThis.dnd5e?.applications?.actor?.ArmorClassConfig;
    if (!ArmorClassConfig) {
      console.warn(`${DND5E_MODULE_ID} | ArmorClassConfig not found — Ordnance AC config popup unavailable.`);
      return null;
    }

    return class OrdnanceArmorClassConfigApp extends ArmorClassConfig {
      /** @override — use our flat-only template. */
      static PARTS = {
        config: {
          template: `modules/${DND5E_MODULE_ID}/templates/actor/ordnance/armor-class-config.hbs`,
        },
      };

      /**
       * Inject the ordnance-specific flat AC value; the calc-mode dropdown
       * is hardcoded out in the template itself.
       * @override
       */
      async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        context.value = this.document.system.armorClass ?? 0;
        return context;
      }
    };
  }
}
