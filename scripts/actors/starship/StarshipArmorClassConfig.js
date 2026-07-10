/**
 * StarshipArmorClassConfig — custom AC configuration popup for player ships.
 *
 * Extends dnd5e's native ArmorClassConfig but:
 *  - Uses a custom template that replaces the editable calc dropdown with a
 *    static "Equipped Components" label, and shows a read-only formula string.
 *  - Overrides _preparePartContext to inject:
 *      context.data.value  — the live computed AC from attributes.ac.value
 *      context.formula     — static formula string
 *      context.breakdown   — per-component contribution list
 *
 * AC is always derived from installed armour + engine component acContribution
 * values; the user cannot override the calculation mode.
 *
 * Built as a factory (.build()) so it can be constructed after dnd5e's "init"
 * hook when the native ArmorClassConfig class is available on globalThis.dnd5e.
 */

const DND5E_MODULE_ID = "causodes-shipcombat-dnd5e";
const COMPONENT_TYPE  = `${DND5E_MODULE_ID}.component`;

export class StarshipArmorClassConfig {
  /**
   * Build the StarshipArmorClassConfigApp class, extending the native
   * dnd5e ArmorClassConfig.  Call this during or after the "init" hook.
   * @returns {typeof ApplicationV2|null}  The built class, or null if dnd5e is
   *   not available.
   */
  static build() {
    const ArmorClassConfig = globalThis.dnd5e?.applications?.actor?.ArmorClassConfig;
    if (!ArmorClassConfig) {
      console.warn(`${DND5E_MODULE_ID} | ArmorClassConfig not found — AC config popup unavailable.`);
      return null;
    }

    return class StarshipArmorClassConfigApp extends ArmorClassConfig {
      /** @override — use our read-only template. */
      static PARTS = {
        config: {
          template: `modules/${DND5E_MODULE_ID}/templates/actor/starship-armor-class-config.hbs`,
        },
      };

      /* -------------------------------------------- */
      /*  Rendering                                   */
      /* -------------------------------------------- */

      /**
       * Replace the editable native context with ship-specific AC breakdown.
       * @override
       */
      async _preparePartContext(partId, context, options) {
        // Call super to set up basic ApplicationV2 context; skip the native
        // AC field setup since our template doesn't use formField helpers.
        context = await super._preparePartContext(partId, context, options);

        // Compute AC from component contributions.
        let armourAC = 0, engineAC = 0;
        const breakdown = [];
        for (const item of this.document.items ?? []) {
          if (item.type !== COMPONENT_TYPE) continue;
          // Only equipped components contribute AC (matches computeComponentAC).
          if (item.system?.equipped === false) continue;
          const slot   = item.system?.slot;
          if (slot !== "armour" && slot !== "engine") continue;
          const contrib = slot === "armour"
            ? (item.system?.acContributionArmor  ?? 0)
            : (item.system?.acContributionEngine ?? 0);
          breakdown.push({ name: item.name, slot, value: contrib });
          if (slot === "armour") armourAC += contrib;
          else                   engineAC += contrib;
        }

        context.data      = { value: this.document.system.attributes.ac.value ?? 0 };
        context.formula   = `@armour.acContributionArmor + @engine.acContributionEngine`;
        context.breakdown = breakdown;

        return context;
      }
    };
  }
}
