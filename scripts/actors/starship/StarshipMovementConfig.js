/**
 * StarshipMovementConfig
 *
 * A popup that lets the user configure the starship's travel speed, travel
 * pace, and travel unit.  Opened via the gear button on the Travel Speed and
 * Travel Pace sidebar rows (data-action="showConfiguration" data-config="movement").
 *
 * Modelled on StarshipClassificationConfig / dnd5e's BaseConfigSheet pattern:
 *   - Extends DocumentSheet5e (ApplicationV2 + DocumentSheetV2)
 *   - submitOnChange: true so changing a value or selecting a unit saves instantly
 *   - Single PARTS.config pointing at our template
 */

const DND5E_MODULE_ID = "causodes-shipcombat-dnd5e";

export class StarshipMovementConfig {
  /**
   * Build the class once DocumentSheet5e is available (post-init).
   * Returns the class constructor.
   */
  static build() {
    const DocumentSheet5e = globalThis.dnd5e?.applications?.api?.DocumentSheet5e;
    if (!DocumentSheet5e) {
      console.error("StarshipMovementConfig | dnd5e.applications.api.DocumentSheet5e not found.");
      return null;
    }

    class StarshipMovementConfigApp extends DocumentSheet5e {
      /** @override */
      static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS ?? {},
        {
          classes:     ["config-sheet", "starship-movement"],
          sheetConfig: false,
          position:    { width: 280 },
          form:        { submitOnChange: true },
        },
        { inplace: false }
      );

      /** @override */
      static PARTS = {
        config: {
          template: `modules/${DND5E_MODULE_ID}/templates/actor/starship-movement-config.hbs`,
        },
      };

      /** @override */
      get title() {
        return game.i18n.localize("DND5E.MOVEMENT.Action.Configure");
      }

      /** @override */
      async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);

        const src = this.document.system._source.attributes.travel;
        context.travel = {
          speedsMax: src.speeds.max,
          pacesMax:  src.paces.max,
          units:     src.units,
        };

        // Build unit options from CONFIG.DND5E.movementUnits.
        // The key is what the data field stores (e.g. "mi", "ft"); the label
        // shown is the abbreviation or label from the config entry.
        const unitMap = CONFIG.DND5E?.movementUnits ?? {};
        context.movementUnits = Object.entries(unitMap).map(([value, cfg]) => ({
          value,
          label:    cfg.abbreviation ?? cfg.label ?? value,
          selected: value === src.units,
        }));

        return context;
      }

      /**
       * Bypass DocumentSheet5e's schema-based form processing so that our
       * flat field names (speeds-max, paces-max, units) are not stripped.
       * @override
       */
      async _prepareSubmitData(event, form, formData) {
        return formData.object;
      }

      /** @override */
      async _processSubmitData(event, form, submitData) {
        const toNum = (v) => (v !== "" && v != null) ? Number(v) : null;
        await this.document.update({
          "system.attributes.travel.speeds.max": toNum(submitData["speeds-max"]),
          "system.attributes.travel.paces.max":  toNum(submitData["paces-max"]),
          "system.attributes.travel.units":      submitData.units ?? "mi",
        });
      }
    }

    return StarshipMovementConfigApp;
  }
}
