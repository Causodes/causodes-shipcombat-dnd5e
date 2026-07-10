/**
 * ShipComponentSheet — item sheet for "causodes-shipcombat-dnd5e.component" items.
 *
 * The "details" PART points to a module-specific template exposing only the
 * fields ShipComponentModel actually has. The "advancement" PART is stripped
 * since ship components don't use the dnd5e advancement system.
 */

// ── Weapon trait definitions (mirrors ShipComponentSheetMixin in core) ───────
const _WEAPON_TRAITS = [
  { key: "shieldBypass",      hasValue: false },
  { key: "unlimitedRof",      hasValue: false },
  { key: "shieldBurn",        hasValue: true,  enabledKey: "shieldBurnEnabled" },
  { key: "rend",              hasValue: true,  enabledKey: "rendEnabled" },
  { key: "armourPenetration", hasValue: true,  enabledKey: "armourPenetrationEnabled" },
  { key: "devastating",       hasValue: true,  enabledKey: "devastatingEnabled" },
  { key: "unreliable",        hasValue: false },
  { key: "overcharge",        hasValue: false },
  { key: "hitRatingModifier", hasValue: true, allowNegative: true, enabledKey: "hitRatingModifierEnabled" },
];

function _weaponTraitsDisplayHtml(traits) {
  const parts = [];
  for (const def of _WEAPON_TRAITS) {
    const raw    = traits?.[def.key];
    const active = def.hasValue
      ? (raw > 0 && (def.enabledKey ? traits[def.enabledKey] : true))
      : raw;
    if (!active) continue;
    const name    = game.i18n.localize(`SHIPCOMBAT.Trait.${def.key.charAt(0).toUpperCase() + def.key.slice(1)}`);
    const display = def.hasValue ? `${name} (${raw})` : name;
    parts.push(`<a data-key="${def.key}" data-value="${raw ?? ""}">${display}</a>`);
  }
  return parts.join(", ");
}

export function buildShipComponentSheet(ItemSheet5e) {

  // ── WeaponTraitsApp — proper dnd5e ApplicationV2 for the traits popup ──────
  // Extends Foundry's own ApplicationV2 (no dnd5e path dependency).  We add
  // "dnd5e2" to DEFAULT_OPTIONS.classes so the CSS layer cascade that drives
  // --dnd5e-application-background etc. applies, then propagate the
  // dark/light theme from the calling sheet in _onRender so the window gets
  // "themed theme-dark/theme-light" identical to native dnd5e config popups.
  class WeaponTraitsApp extends foundry.applications.api.ApplicationV2 {

    static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS ?? {}, {
      classes: ["dnd5e2", "trait-selector"],
      window: {
        title: "SHIPCOMBAT.Component.Traits",
        resizable: false,
        minimizable: false,
      },
      position: { width: 380 },
    }, { inplace: false });

    #resolve  = null;
    #item     = null;
    #callerEl = null;

    constructor({ item, callerEl, resolve, ...rest } = {}) {
      super(rest);
      this.#item     = item;
      this.#callerEl = callerEl ?? null;
      this.#resolve  = resolve  ?? null;
    }

    /** Build the trait-selector form HTML inline — no Handlebars template needed. */
    async _renderHTML(_context, _options) {
      const traits = this.#item?.system?.traits ?? {};
      const lis = _WEAPON_TRAITS.map(def => {
        const name = game.i18n.localize(
          `SHIPCOMBAT.Trait.${def.key.charAt(0).toUpperCase() + def.key.slice(1)}`
        );
        const enabled = def.hasValue
          ? (def.enabledKey ? (traits[def.enabledKey] === true) : (traits[def.key] > 0))
          : (traits[def.key] === true);
        const val      = def.hasValue ? (traits[def.key] ?? 0) : 0;
        const numInput = def.hasValue
          ? `<input type="number" name="${def.key}-value" value="${val}" `
            + `${def.allowNegative ? "" : `min="0"`} style="width:2.5rem;text-align:center">`
          : "";
        return `<li>
            <label class="name">${name}</label>
            <div class="proficiency">
              ${numInput}
              <input type="checkbox" id="trait-${def.key}" name="${def.enabledKey ?? def.key}" ${enabled ? "checked" : ""}>
            </div>
          </li>`;
      }).join("\n");

      const form = document.createElement("form");
      form.className = "dialog-form standard-form";
      form.autocomplete = "off";
      form.innerHTML = `
        <section data-application-part="traits">
          <fieldset class="traits">
            <ol class="unlist trait-list">${lis}</ol>
          </fieldset>
        </section>
        <footer class="form-footer">
          <button type="submit" autofocus>
            <i class="fa-solid fa-check"></i>
            <span>${game.i18n.localize("Confirm")}</span>
          </button>
        </footer>
      `;
      form.addEventListener("submit", ev => {
        ev.preventDefault();
        const data = new FormDataExtended(form).object;
        this.#resolve?.(data);
        this.#resolve = null;
        this.close();
      });
      return form;
    }

    /** Place the rendered form directly into the window-content element. */
    _replaceHTML(result, content, _options) {
      content.replaceChildren(result);
    }

    /** Propagate dark/light theme from the sheet that opened this popup. */
    async _onRender(context, options) {
      await super._onRender(context, options);
      if (!this.element.classList.contains("themed") && this.#callerEl) {
        const theme = this.#callerEl.classList.contains("theme-dark") ? "theme-dark"
          : this.#callerEl.classList.contains("theme-light") ? "theme-light"
          : null;
        if (theme) this.element.classList.add("themed", theme);
      }
    }

    /** If the window is closed without submitting, resolve the promise with null. */
    async _onClose(options) {
      this.#resolve?.(null);
      this.#resolve = null;
      return super._onClose(options);
    }

    /**
     * Open the traits editor for the given item and return a Promise.
     * @param {Item5e}      item      The ship component item.
     * @param {HTMLElement} callerEl  The sheet element (for theme propagation).
     * @returns {Promise<object|null>}  Submitted form data, or null if dismissed.
     */
    static async prompt(item, callerEl) {
      return new Promise(resolve => {
        new this({ item, callerEl, resolve }).render({ force: true });
      });
    }
  }

  // ── ShipComponentSheet ────────────────────────────────────────────────────

  class ShipComponentSheet extends ItemSheet5e {

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        classes: ["causodes-shipcombat-dnd5e", "component"],
        window: {
          title: "SHIPCOMBAT.DND5E.Sheet.Component",
        },
      },
      { inplace: false }
    );

    /**
     * Always open in edit mode — ship components have no meaningful "play mode"
     * distinction, and PLAY mode would disable all fields via _disableFields().
     * dnd5e PrimarySheet5e.MODES.EDIT === 2.
     * @override
     */
    _mode = 2;

    /**
     * Keep all stock PARTS except "advancement", replace "details" with a
     * component-specific template, and replace "header" with a minimal version
     * that does not call {{formInput}} with quantity/weight/price — fields that
     * don't exist in ShipComponentModel (those calls produce the four
     * "Non-existent data field" console warnings).
     * @override
     */
    static PARTS = (() => {
      const { advancement, details: _stockDetails, header: _stockHeader, ...rest } = ItemSheet5e.PARTS;
      return {
        header: {
          template: "modules/causodes-shipcombat-dnd5e/templates/item/component-header.hbs",
        },
        ...rest,
        details: {
          template: "modules/causodes-shipcombat-dnd5e/templates/item/component-details.hbs",
          scrollable: [""],
        },
      };
    })();

    /**
     * Remove the "advancement" tab only; keep "details" now that it has a
     * proper component template.
     * @override
     */
    static TABS = ItemSheet5e.TABS.filter(
      t => t.tab !== "advancement"
    );

    /** @override */
    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      if (partId === "details") {
        const rawSource = this.item._source?.system ?? {};
        context.source = { ...rawSource };
        // Guard: per-slot AC fields added after items may have been created;
        // _source won't have them on old items — migrateData handles this but
        // guard here too so the template never renders undefined as "".
        context.source.acContributionArmor  ??= 0;
        context.source.acContributionEngine ??= 0;
        // Damage type choices: physical types first, then elemental/magical,
        // separated by a rule marker — matching the native dnd5e damage picker
        // layout (minus the "maximum hit points" heal-type entry).
        const rawTypes = CONFIG.DND5E?.damageTypes ?? {};
        const allTypes = Object.entries(rawTypes).map(([value, cfg]) => ({
          value,
          label: typeof cfg === "string" ? cfg : (cfg.label ?? value),
          isPhysical: typeof cfg === "object" && !!cfg.isPhysical,
        }));
        const physical = allTypes.filter(t =>  t.isPhysical);
        const other    = allTypes.filter(t => !t.isPhysical);
        context.damageTypes = [...physical, { rule: true }, ...other];
        // Active traits summary displayed below the "Traits" edit button.
        context.traitsDisplayHtml = _weaponTraitsDisplayHtml(
          this.item._source?.system?.traits ?? {}
        );
      }
      return context;
    }

    async _onChangeForm(formConfig, event) {
      if (event.target?.name === "system.slot") return;
      return super._onChangeForm(formConfig, event);
    }

    /**
     * After the details part renders, apply the correct slot-group visibility
     * and attach a live slot-change listener.
     * @override
     */
    _attachPartListeners(partId, htmlElement, options) {
      super._attachPartListeners(partId, htmlElement, options);
      if (partId !== "details") return;

      const slotSelect = htmlElement.querySelector("[name='system.slot']");
      if (!slotSelect) return;

      // Apply visibility immediately (covers initial render and re-renders
      // triggered by other field changes).
      this._applySlotVisibility(htmlElement, slotSelect.value);

      // Live listener: save slot without re-rendering, then update DOM.
      slotSelect.addEventListener("change", async (event) => {
        const slot = event.target.value;
        await this.item.update({ "system.slot": slot }, { render: false });
        this._applySlotVisibility(htmlElement, slot);
      });
    }

    /**
     * Show only the [data-slot-group] fieldset whose key matches the active
     * slot; hide all others. Also disables child inputs in hidden fieldsets
     * so they are excluded from AppV2's form collection — without this,
     * duplicate name attributes (e.g. system.dieSize in both weapon and
     * weaponsBay groups) produce array values like "d6,d6" that fail schema
     * validation.
     */
    _applySlotVisibility(detailsEl, slot) {
      detailsEl.querySelectorAll("[data-slot-group]").forEach(el => {
        const active = el.dataset.slotGroup === slot;
        el.classList.toggle("hidden", !active);
        // fieldset.disabled disables all contained form controls; FormData
        // skips disabled controls so they don't pollute the submit payload.
        el.disabled = !active;
      });
    }

    /**
     * Open the weapon-traits editor (WeaponTraitsApp, a proper Application5e
     * popup).  Mirrors ShipComponentSheetMixin._onEditWeaponTraits in core.
     * @this {ShipComponentSheet}
     */
    static async _onEditWeaponTraits() {
      const traitPath = "system.traits";

      const result = await WeaponTraitsApp.prompt(this.item, this.element);
      if (!result) return;

      const updates = {};
      for (const def of _WEAPON_TRAITS) {
        if (def.hasValue) {
          updates[`${traitPath}.${def.key}`] = Number(result[`${def.key}-value`] ?? 0);
          if (def.enabledKey) {
            updates[`${traitPath}.${def.enabledKey}`] = result[def.enabledKey] === true || result[def.enabledKey] === "on";
          }
        } else {
          updates[`${traitPath}.${def.key}`] = result[def.key] === true || result[def.key] === "on";
        }
      }
      // Save without triggering a full sheet re-render (which resets the active
      // tab to the first tab).  Directly patch the traits-summary nodes in the
      // live DOM so the display refreshes without replacing the part element
      // (which would strip its "active" tab state and hide the tab contents).
      await this.item.update(updates, { render: false });
      const traitsHtml = _weaponTraitsDisplayHtml(this.item._source?.system?.traits ?? {});
      const detailsPart = this.element.querySelector("[data-application-part='details']");
      if (detailsPart) {
        for (const el of detailsPart.querySelectorAll(".readonly")) {
          el.innerHTML = traitsHtml;
        }
      }
    }

  }

  // Register the editWeaponTraits action after the class is fully defined
  // (static methods exist before static fields run, but we need to merge into
  // DEFAULT_OPTIONS which was already set; mergeObject adds the new key in-place).
  foundry.utils.mergeObject(ShipComponentSheet.DEFAULT_OPTIONS, {
    actions: { editWeaponTraits: ShipComponentSheet._onEditWeaponTraits },
  });

  return ShipComponentSheet;
}
