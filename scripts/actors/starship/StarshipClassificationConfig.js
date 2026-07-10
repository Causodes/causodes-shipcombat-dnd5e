/**
 * StarshipClassificationConfig
 *
 * A cog-wheel popup that lets the user pick a starship classification from
 * the SHIP_CLASSIFICATIONS list defined in the core module.  Replaces the
 * plain text input in player-ship-header.hbs.
 *
 * Modelled on dnd5e's CreatureTypeConfig / BaseConfigSheet pattern:
 *   - Extends DocumentSheet5e (ApplicationV2 + DocumentSheetV2)
 *   - _onRender directly calls document.update() on radio/text change
 *   - Single PARTS.config pointing at our template
 */

const { SHIP_CLASSIFICATIONS } = globalThis.ShipCombat._api;

const DND5E_MODULE_ID = "causodes-shipcombat-dnd5e";

export class StarshipClassificationConfig {
  /**
   * Build the class once DocumentSheet5e is available (post-init).
   * Returns the class constructor.
   */
  static build() {
    const DocumentSheet5e = globalThis.dnd5e?.applications?.api?.DocumentSheet5e;
    if (!DocumentSheet5e) {
      console.error("StarshipClassificationConfig | dnd5e.applications.DocumentSheet5e not found.");
      return null;
    }

    class StarshipClassificationConfigApp extends DocumentSheet5e {
      /** @override */
      static DEFAULT_OPTIONS = foundry.utils.mergeObject(
        super.DEFAULT_OPTIONS ?? {},
        {
          classes: ["config-sheet", "starship-classification"],
          sheetConfig: false,
          position: { width: 320 },
        },
        { inplace: false }
      );

      /** @override */
      static PARTS = {
        config: {
          template: `modules/${DND5E_MODULE_ID}/templates/actor/starship-classification-config.hbs`,
        },
      };

      /** @override */
      get title() {
        return game.i18n.localize("SHIPCOMBAT.Label.Classification");
      }

      /** @override */
      async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        // classification stores the label text (e.g. "Fighter"); match on label for pre-selection.
        const currentLabel = this.document.system._source?.details?.classification ?? "";
        // Exclude blank entry and the old "other" catch-all (replaced by custom input below).
        context.options = SHIP_CLASSIFICATIONS.filter(c => c.value && c.value !== "other");
        context.currentLabel = currentLabel;
        context.preview = currentLabel || "—";
        context.rows = Math.ceil((context.options.length + 1) / 2);  // +1 for custom row
        // Custom type: any non-empty classification that doesn't match a predefined label.
        const predefinedEntry = context.options.find(c => c.label === currentLabel);
        context.isCustom = !!currentLabel && !predefinedEntry;
        context.customLabel = context.isCustom ? currentLabel : "";
        return context;
      }

      /**
       * Directly update the document when a radio button or text input changes,
       * bypassing the form submission pipeline entirely.  This mirrors how the
       * native dnd5e CreatureTypeConfig achieves immediate saves (there, form
       * fields use full document-path names so submitOnChange writes directly;
       * here we need to map slug → label, so we own the update call).
       * @override
       */
      async _onRender(context, options) {
        await super._onRender(context, options);

        // Radio buttons: map slug → label and update immediately on selection.
        for (const radio of this.element.querySelectorAll('[name="classification"]')) {
          radio.addEventListener("change", async (event) => {
            const value = event.target.value;
            if (value === "custom") return; // handled by the text input below
            const entry = SHIP_CLASSIFICATIONS.find(c => c.value === value);
            await this.document.update({
              "system.details.classification": entry?.label ?? value,
            });
          });
        }

        // Custom text input: save on change (blur / Enter).
        const customInput = this.element.querySelector('[name="customClassification"]');
        if (customInput) {
          customInput.addEventListener("change", async (event) => {
            await this.document.update({
              "system.details.classification": event.target.value.trim(),
            });
          });
        }
      }
    }

    return StarshipClassificationConfigApp;
  }
}
