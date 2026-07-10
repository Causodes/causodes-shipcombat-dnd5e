/**
 * OrdnanceSheet — sheet for "causodes-shipcombat-dnd5e.shipOrdnance" actors
 * (torpedoes and strike craft).
 *
 * Structural chrome (header/sidebar/collapser/warnings/right-side icon tabs)
 * mirrors PlayerShipSheet/NpcShipSheet exactly — native NPCActorSheet
 * structural templates, our own sidebar template, native two-pane layout.
 * The tab *content* is core's OrdnanceSheetMixin main/config templates
 * (hull/fuel/ammo bars, helm sliders, Detonate/Attack) instead of ship-role
 * tabs. Behavior (actions, context prep, slider wiring) still comes from
 * OrdnanceSheetMixin(NPCActorSheet) — only PARTS/TABS are replaced so the
 * content renders inside dnd5e's native chrome instead of the mixin's own
 * flat/compact layout (which core built for a plain AppV2 host, not dnd5e's
 * two-pane NPC sheet — see git history for that earlier attempt).
 *
 * Two NPCActorSheet-native lifecycle quirks still apply regardless of PARTS
 * and are neutralised below:
 *   - _preparePartContext("header", ...) still routes to the native
 *     _prepareHeaderContext, which destructures resources.legact/legres from
 *     raw source data (ShipOrdnanceModel's `resources` is a bare ObjectField with
 *     no such keys) — bypassed.
 *   - _onRender unconditionally calls _renderCreateInventory()/
 *     _renderAttunement() (no fields/DOM for either on our schema/PARTS) and
 *     reads actor.system.details.xp.value for the CR/XP badge injected into
 *     every actor sheet's title bar — the first two are no-op'd, the xp field
 *     is stubbed on ShipOrdnanceModel.
 *   - PrimarySheetMixin._onFirstRender (above NPCActorSheet) unconditionally
 *     appends a generic "add child document" button into .window-content for
 *     any editable sheet — stripped post-render, ordnance actors have no
 *     embedded-item workflow.
 */

const CORE_MODULE_ID  = "causodes-shipcombat-core";
const DND5E_MODULE_ID = "causodes-shipcombat-dnd5e";

// Icon descriptors for the two ordnance tabs, matching PlayerShipSheet's
// ROLE_ICONS pattern for the right-side icon-tab strip.
const ORDNANCE_TAB_ICONS = {
  main:   "fas fa-bomb",
  config: "fas fa-cog",
};

export function buildOrdnanceSheet(NPCActorSheet, ArmorClassConfigApp) {
  const { OrdnanceSheetMixin, SystemAdapter } = globalThis.ShipCombat._api;

  class OrdnanceSheet extends OrdnanceSheetMixin(NPCActorSheet) {

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        classes:  [...(super.DEFAULT_OPTIONS?.classes ?? []), "causodes-shipcombat-dnd5e"],
        window:   { title: "SHIPCOMBAT.DND5E.Sheet.Ordnance" },
        position: { width: 700, height: 700 },
        actions:  {
          /** Toggle between actor portrait and token image (native header behavior). */
          togglePortrait: async function togglePortrait(event, target) {
            const current = this.actor.getFlag("dnd5e", "showTokenPortrait") === true;
            this.actor._preferredArtwork = null;
            await this.actor.setFlag("dnd5e", "showTokenPortrait", !current);
          },
        },
      },
      { inplace: false }
    );

    /**
     * Native NPC structural templates (header/sidebarCollapser/sidebar/
     * warnings/tabs-right) + core's ordnance main/config content wrapped in
     * tab-body, same grouping PlayerShipSheet uses for its role-content tabs.
     * "header" is OUR OWN template (modeled on player-ship-header.hbs), not
     * core's OrdnanceSheetMixin one — that one was built for a plain,
     * sidebar-less AppV2 host and doesn't respect dnd5e's two-column NPC
     * layout (portrait column sized to the sidebar width + a "stats" column
     * spanning the remaining main-content width).
     * @override
     */
    static PARTS = {
      header: {
        template: `modules/${DND5E_MODULE_ID}/templates/actor/ordnance/header.hbs`,
      },
      sidebarCollapser: {
        container: { classes: ["main-content"], id: "main" },
        template:  "systems/dnd5e/templates/actors/parts/sidebar-collapser.hbs",
      },
      sidebar: {
        container: { classes: ["main-content"], id: "main" },
        template:  `modules/${DND5E_MODULE_ID}/templates/actor/ordnance/sidebar.hbs`,
        templates: ["systems/dnd5e/templates/actors/parts/actor-trait-line.hbs"],
      },
      main: {
        container:  { classes: ["tab-body"], id: "tabs" },
        template:   `modules/${CORE_MODULE_ID}/templates/actor/sheets/ordnance-main.hbs`,
        scrollable: [""],
      },
      config: {
        container:  { classes: ["tab-body"], id: "tabs" },
        template:   `modules/${CORE_MODULE_ID}/templates/actor/sheets/ordnance-config.hbs`,
        scrollable: [""],
      },
      warnings: {
        template: "systems/dnd5e/templates/actors/parts/actor-warnings-dialog.hbs",
      },
      tabs: {
        id:       "tabs",
        classes:  ["tabs-right"],
        template: "systems/dnd5e/templates/shared/sidebar-tabs.hbs",
      },
    };

    /**
     * dnd5e's PrimarySheetMixin requires static TABS as an array (it calls
     * .find()/.reduce() on it), but core's OrdnanceSheetMixin defines TABS as
     * an object keyed by tab id. Convert once here, plus attach icons for the
     * right-side icon-tab strip (same pattern as PlayerShipSheet's
     * SHIP_TABS_ARRAY conversion).
     * @override
     */
    static TABS = Object.entries(super.TABS ?? {}).map(([tab, cfg]) => ({
      tab, ...cfg, icon: ORDNANCE_TAB_ICONS[tab] ?? "fas fa-circle",
    }));

    /**
     * Default active tab. Without this, the sheet inherits NPCActorSheet's
     * own default ({ primary: "features" }), which matches neither of our
     * two tab ids — _getTabs() then marks NEITHER "main" nor "config" as
     * active, so both <section class="tab"> render simultaneously with no
     * active/inactive distinction, stacking/overlapping into an unreadable
     * mess. Same fix PlayerShipSheet already applies for its own tab set.
     * @override
     */
    tabGroups = { primary: "main" };

    /** @override */
    get title() {
      return this.actor.name ?? game.i18n.localize("SHIPCOMBAT.DND5E.Sheet.Ordnance");
    }

    /**
     * Supply the context core's ordnance-config.hbs reads to render the
     * component-style payload damage block (Number | Die | Bonus | Type):
     * the useComponentDamage flag and the die-size / damage-type lists.
     * @override
     */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      context.useComponentDamage = true;
      context.diceOptions = [
        { value: "d4",  label: "d4"  },
        { value: "d6",  label: "d6"  },
        { value: "d8",  label: "d8"  },
        { value: "d10", label: "d10" },
        { value: "d12", label: "d12" },
        { value: "d20", label: "d20" },
      ];
      // Physical types first, a separator, then elemental/magical — matching
      // the ship-component weapon Type dropdown.
      const rawTypes = CONFIG.DND5E?.damageTypes ?? {};
      const allTypes = Object.entries(rawTypes).map(([value, cfg]) => ({
        value,
        label:      typeof cfg === "string" ? cfg : (cfg.label ?? value),
        isPhysical: typeof cfg === "object" && !!cfg.isPhysical,
      }));
      const physical = allTypes.filter(t =>  t.isPhysical);
      const other    = allTypes.filter(t => !t.isPhysical);
      context.damageTypeChoices = [...physical, { rule: true }, ...other];
      return context;
    }

    /**
     * dnd5e's tab-building hook is _getTabs(), not core's _prepareTabs() (that
     * method is written for a generic AppV2 tabs convention dnd5e doesn't use,
     * so it's never called here). Port its subtype-relabeling and GM-only
     * config-tab logic into the hook dnd5e actually calls.
     * @override
     */
    _getTabs() {
      const tabs = super._getTabs();
      if (!game.user.isGM) delete tabs.config;

      const sys = SystemAdapter.current.getShipData(this.actor);
      const subtype = sys.subtype ?? "";
      if (subtype === "strikeCraft") {
        const craftType = sys.craftType ?? "fighter";
        tabs.main.label = craftType === "bomber"
          ? "SHIPCOMBAT.CraftType.Bomber"
          : "SHIPCOMBAT.CraftType.Fighter";
      } else if (subtype === "torpedo") {
        tabs.main.label = "SHIPCOMBAT.Tab.Warhead";
      }
      return tabs;
    }

    /**
     * Bypass NPCActorSheet._prepareHeaderContext — it destructures
     * resources.legact/legres from context.source (ShipOrdnanceModel's
     * `resources` is a bare ObjectField with no such keys) and computes
     * ability/legendary-action data our ordnance-header.hbs doesn't use.
     * @override
     */
    async _prepareHeaderContext(context, options) {
      context.portrait = await this._preparePortrait(context);
      // Ordnance type label displayed under the name (where size /
      // classification sits on the ship sheets): "Torpedo",
      // "Strike Craft (Fighter)", or "Strike Craft (Bomber)".
      const sys = SystemAdapter.current.getShipData(this.actor);
      if (sys.subtype === "torpedo") {
        context.ordnanceTypeLabel = game.i18n.localize("SHIPCOMBAT.Term.Torpedo");
      } else if (sys.subtype === "strikeCraft") {
        const craft = game.i18n.localize(
          sys.craftType === "bomber" ? "SHIPCOMBAT.CraftType.Bomber" : "SHIPCOMBAT.CraftType.Fighter"
        );
        context.ordnanceTypeLabel = `${game.i18n.localize("SHIPCOMBAT.Term.StrikeCraft")} (${craft})`;
      } else {
        context.ordnanceTypeLabel = "";
      }
      return context;
    }

    /**
     * Replace NPCActorSheet._prepareSidebarContext (which reads
     * attributes.movement per-type, skills.prc, habitat, treasure — none of
     * which exist in ShipOrdnanceModel's shape) with just what ordnance/sidebar.hbs
     * actually needs: resistance/immunity/vulnerability pills and the
     * "important" flag. Travel/price/weight/keel/beam/crew/passengers in that
     * template read straight off context.system/source/fields, already
     * populated by the generic _prepareContext chain.
     * @override
     */
    async _prepareSidebarContext(context, options) {
      try { context.traits = this._prepareTraits(context); }
      catch (e) { context.traits = {}; }
      context.important = this.actor.system.traits?.important ?? false;
      return context;
    }

    /** @override — ordnance actors have no inventory toolbar (no "inventory" PART exists). */
    _renderCreateInventory() {}

    /** @override — ordnance actors do not attune items. */
    _renderAttunement() {}

    /**
     * Rename the RTG label to HIT in the strike-craft sensor stats row on
     * every render.  The label is hard-coded in core's strike-craft-config.hbs
     * (shared across all systems); post-render DOM patching is the dnd5e-only
     * approach that avoids touching the core template (mirrors the SF2e
     * OrdnanceSheet pattern).
     * @override
     */
    _onRender(context, options) {
      super._onRender?.(context, options);
      const hitModLabel = game.i18n.localize("SHIPCOMBAT.DND5E.Component.HitModifier");
      for (const label of this.element.querySelectorAll(".shipcombat-torpedo-stat label")) {
        if (label.textContent.trim() === "RTG") {
          label.textContent = "HIT";
          label.dataset.tooltip = hitModLabel;
        }
      }
    }

    /**
     * Intercept the native showConfiguration handler for the AC cog button
     * in our header (data-config="armorClass") to open OrdnanceArmorClassConfig
     * instead of dnd5e's native ArmorClassConfig (which targets attributes.ac,
     * not our system.armorClass field).
     * @override
     */
    _showConfiguration(event, target) {
      if (target.dataset.config === "armorClass") {
        if (ArmorClassConfigApp) {
          this._renderChild(new ArmorClassConfigApp({ document: this.actor }));
        }
        return false;
      }
      // Let the parent handle everything else.
    }

    /**
     * Two DOM-level cleanups Foundry's DEFAULT_OPTIONS merge can't express:
     *
     * 1. Foundry aggregates .application's class list by walking the whole
     *    ancestor chain and collecting each class's OWN static DEFAULT_OPTIONS
     *    directly — not the merged value each subclass computes. So filtering
     *    "vehicle" out of *our own* merged classes array (tried previously)
     *    has no effect; core's OrdnanceSheetMixin still contributes it
     *    directly. "vehicle" collides with dnd5e's NATIVE VehicleActorSheet
     *    CSS (`.dnd5e2.sheet.actor.vehicle .window-content` forces a
     *    2-column grid expecting that sheet's own `.sheet-sidebar`
     *    structure), which is what was squeezing our header into a narrow
     *    first column with the sidebar beside it instead of below it. Must
     *    be removed from the rendered element directly.
     * 2. PrimarySheetMixin._onFirstRender (a level above NPCActorSheet)
     *    always appends a generic "add child document" button into
     *    .window-content for any editable sheet. Ordnance actors are
     *    self-contained stat blocks with no embedded-item workflow.
     * @override
     */
    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      this.element.classList.remove("vehicle");
      this.element.querySelector(":scope > .window-content > .create-child")?.remove();
    }

  }

  return OrdnanceSheet;
}
