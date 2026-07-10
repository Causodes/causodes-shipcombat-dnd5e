/**
 * StarshipHitPointsConfig — custom HP configuration popup for player ships.
 *
 * Extends dnd5e's native HitPointsConfig but:
 *  - Uses a custom template that omits Temporary Maximum, Temporary Hit Points,
 *    and Damage Threshold (irrelevant for ships).
 *  - Overrides _preparePartContext to surface hull.value / hull.max as the form
 *    source values (since prepareDerivedData overwrites hp with hull, the raw
 *    _source.attributes.hp fields may be stale).
 *  - Overrides _processSubmitData to write Max HP and Current HP changes to
 *    system.hull.* instead of system.attributes.hp.*, which would be overwritten
 *    immediately by prepareDerivedData.  The formula field is left in hp.
 *
 * Built as a factory (`.build()`) so it can be constructed after dnd5e's "init"
 * hook when the native HitPointsConfig class is available on globalThis.dnd5e.
 */

const DND5E_MODULE_ID = "causodes-shipcombat-dnd5e";

export class StarshipHitPointsConfig {
  /**
   * Build the StarshipHitPointsConfigApp class, extending the native
   * dnd5e HitPointsConfig.  Call this during or after the "init" hook.
   * @returns {typeof ApplicationV2|null}  The built class, or null if dnd5e is
   *   not available.
   */
  static build() {
    const HitPointsConfig = globalThis.dnd5e?.applications?.actor?.HitPointsConfig;
    if (!HitPointsConfig) {
      console.warn(`${DND5E_MODULE_ID} | HitPointsConfig not found — HP config popup will use native template.`);
      return null;
    }

    return class StarshipHitPointsConfigApp extends HitPointsConfig {
      /** @override — use our template that omits temp/tempmax/dt fields. */
      static PARTS = {
        config: {
          template: `modules/${DND5E_MODULE_ID}/templates/actor/starship-hitpoints-config.hbs`,
        },
      };

      /* -------------------------------------------- */
      /*  Rendering                                   */
      /* -------------------------------------------- */

      /**
       * Override context preparation to display hull values rather than the
       * potentially-stale _source.attributes.hp values.
       *
       * ShipModel.prepareDerivedData() keeps attributes.hp in sync with
       * hull at runtime, but _source.attributes.hp (the raw stored data) may
       * diverge if writes went to hull.* directly.  We replace source.max and
       * source.value with the live hull values so the form always reflects
       * the real ship HP.
       *
       * We also clear otherFields so neither dt nor temp/tempmax appear in the
       * "Other" fieldset.
       * @override
       */
      async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        const hull = this.document.system.hull ?? {};
        // Replace the form-displayed source values with hull (source of truth).
        context.source = {
          ...context.source,
          max:   hull.max   ?? context.source.max,
          value: hull.value ?? context.source.value,
        };
        // Live derived hp is already synced from hull in prepareDerivedData;
        // override just in case.
        context.data = {
          ...context.data,
          value:       hull.value ?? 0,
          effectiveMax: hull.max   ?? 50,
        };
        // Ships have no "Other" HP fields (no dt, no temp/tempmax shown).
        context.otherFields = [];
        return context;
      }

      /* -------------------------------------------- */
      /*  Form Submission                             */
      /* -------------------------------------------- */

      /**
       * Remap hp.max → hull.max and hp.value → hull.value before saving.
       *
       * The native HitPointsConfig writes to system.attributes.hp.*, but those
       * fields are overwritten by prepareDerivedData() (which copies hull into
       * hp).  We intercept the submit data and redirect max/value to hull
       * instead, which IS the authoritative source for ship HP.
       *
       * The formula field remains in system.attributes.hp.formula (it is not
       * overwritten by prepareDerivedData, so no remapping is needed).
       *
       * We call super last so the parent's max-delta value adjustment still runs
       * (it adjusts hp.value by the change in hp.max).  Since hp.value is
       * secondary (overwritten by hull.value in prepareDerivedData anyway), this
       * has no harmful effect, and we have already written the explicit
       * hull.value if the user set it.
       * @override
       */
      _processSubmitData(event, form, submitData) {
        const hp = submitData?.system?.attributes?.hp;
        if (hp) {
          submitData.system.hull ??= {};
          // Mirror the user's max/value edits into hull (source of truth).
          if ("max"   in hp) submitData.system.hull.max   = hp.max;
          if ("value" in hp) submitData.system.hull.value = hp.value;
          // formula stays in hp (not overridden by prepareDerivedData).
        }
        // Call super; parent adjusts hp.value by max-delta (harmless since
        // hull.value takes precedence via prepareDerivedData).
        super._processSubmitData(event, form, submitData);
      }
    };
  }
}
