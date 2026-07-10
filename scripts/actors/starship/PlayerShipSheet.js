/**
 * PlayerShipSheet — sheet for "causodes-shipcombat-dnd5e.ship" actors
 * (the player-crewed starship type).
 *
 * Extends NPCActorSheet directly via ShipSheetV2Mixin so we inherit both:
 *   - Mixin:         crew-role context building + event handlers
 *   - NPCActorSheet: native dnd5e NPC chrome (portrait, ability scores,
 *                    right-side icon tabs, sidebar, drag-drop, warnings)
 *
 * PARTS is fully hardcoded:
 *   - Structural: native NPC templates (header, sidebar, collapser, warnings)
 *   - Content:    core module role-tab templates, each wrapped in tab-body
 *   - Navigation: sidebar-tabs.hbs → right-side icon tabs (matches NPC sheet)
 */

const { ShipSheetV2Mixin, SHIP_PARTS, SHIP_TABS, emitToGM } = globalThis.ShipCombat._api;

const CORE_MODULE_ID  = "causodes-shipcombat-core";
const DND5E_MODULE_ID = "causodes-shipcombat-dnd5e";

// Icon descriptors for each role tab.
const ROLE_ICONS = {
  overview:     { icon: "fas fa-star" },
  captain:      { icon: "fas fa-user-tie" },
  captain4man:  { icon: "fas fa-user-tie" },
  captain5man:  { icon: "fas fa-user-tie" },
  engineer3man: { icon: "fas fa-wrench" },
  engineer5man: { icon: "fas fa-wrench" },
  engineer:     { icon: "fas fa-wrench" },
  pilot:        { icon: "fas fa-steering-wheel" },
  sensors:      { icon: "fas fa-satellite-dish" },
  gunner4man:   { icon: "fas fa-crosshairs" },
  gunner5man:   { icon: "fas fa-crosshairs" },
  gunner:       { icon: "fas fa-crosshairs" },
  ordnance:     { icon: "fas fa-bomb" },
  config:       { icon: "fas fa-cog" },
};

// Convert SHIP_TABS object → array (dnd5e PrimarySheetMixin calls .find()/.reduce())
// and add icons so the right-side tab strip renders like the native NPC sheet.
const SHIP_TABS_ARRAY = Object.values(SHIP_TABS).map(t => ({
  tab:   t.id,
  group: t.group ?? "primary",
  label: t.label,
  ...(ROLE_ICONS[t.id] ?? { icon: "fas fa-circle" }),
}));

// Wrap every core content part in tab-body so the NPC sheet's tab container
// system renders them correctly.  Strip the old header/tabs parts — we replace
// those with native NPC equivalents below.
const CONTENT_PARTS = Object.fromEntries(
  Object.entries(SHIP_PARTS)
    .filter(([id]) => id !== "header" && id !== "tabs")
    .map(([id, def]) => [id, {
      ...def,
      container: { classes: ["tab-body"], id: "tabs" },
    }])
);

let _BaseActorSheet = null;

export function buildPlayerShipSheet(NPCActorSheet, ClassificationConfigApp, MovementConfigApp, HitPointsConfigApp, ArmorClassConfigApp) {
  _BaseActorSheet ??= Object.getPrototypeOf(NPCActorSheet);

  class PlayerShipSheet extends ShipSheetV2Mixin(NPCActorSheet) {

    /* ── Static configuration ─────────────────────────────────────────── */

    /** @override */
    static DEFAULT_OPTIONS = foundry.utils.mergeObject(
      super.DEFAULT_OPTIONS ?? {},
      {
        classes:  ["causodes-shipcombat-dnd5e", "starship", "player"],
        window:   { title: "SHIPCOMBAT.DND5E.Sheet.PlayerShip" },
        position: { width: 800, height: 1000 },
        actions:  {
          /** Toggle between actor portrait and token image. */
          togglePortrait: async function togglePortrait(event, target) {
            const current = this.actor.getFlag("dnd5e", "showTokenPortrait") === true;
            this.actor._preferredArtwork = null;
            await this.actor.setFlag("dnd5e", "showTokenPortrait", !current);
          },
          /** Full combat reset — confirms, then emits to GM. */
          fullReset: async function fullReset(event, target) {
            const ok = await foundry.applications.api.DialogV2.confirm({
              window:  { title: game.i18n.localize("SHIPCOMBAT.Dialog.FullReset") },
              content: `<p>${game.i18n.localize("SHIPCOMBAT.Dialog.FullResetBody")}</p>`,
            });
            if (ok) emitToGM("fullReset", {});
          },
        },
      },
      { inplace: false }
    );

    /**
     * Fully hardcoded: native NPC structural templates + core role-content tabs
     * + right-side sidebar-tabs navigation.  No ambiguity with mixin PARTS.
     * @override
     */
    static PARTS = {
      header: {
        template: `modules/${DND5E_MODULE_ID}/templates/actor/player-ship-header.hbs`,
      },
      sidebarCollapser: {
        container: { classes: ["main-content"], id: "main" },
        template:  "systems/dnd5e/templates/actors/parts/sidebar-collapser.hbs",
      },
      sidebar: {
        container: { classes: ["main-content"], id: "main" },
        template:  `modules/${DND5E_MODULE_ID}/templates/actor/player-ship-sidebar.hbs`,
        templates: ["systems/dnd5e/templates/actors/parts/actor-trait-line.hbs"],
      },
      // Ship role content tabs (from core module, each in tab-body)
      ...CONTENT_PARTS,
      // Right-side icon tab navigation (matches native NPC sheet)
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
     * Role tabs with icons, as array (required by dnd5e PrimarySheetMixin).
     * @override
     */
    static TABS = SHIP_TABS_ARRAY;

    /* ── Parts / tabs filtering ─────────────────────────────────────────── */

    /**
     * Extend the mixin's allowedParts set to include the native NPC structural
     * parts that the controller doesn't know about (sidebarCollapser, sidebar,
     * warnings).  Without this, _configureRenderOptions (from ShipSheetV2Mixin)
     * filters them out before rendering.
     * @override
     */
    _allowedParts() {
      const allowed = super._allowedParts();
      for (const p of ["header", "sidebarCollapser", "sidebar", "warnings"]) {
        allowed.add(p);
      }
      return allowed;
    }

    /**
     * Filter the icon-tab strip to only the roles active for this ship's crew
     * size.  Actor sheets populate the sidebar-tabs strip from context.tabs set
     * by PrimarySheetMixin._getTabs(), NOT from _prepareTabsContext (which is
     * only used by CompendiumBrowser).
     * @override
     */
    _getTabs() {
      const all     = super._getTabs();            // map of all 14 tabs
      const allowed = this.controller.buildTabs(); // map of active tabs only
      for (const key of Object.keys(all)) {
        if (!allowed[key]) delete all[key];
      }
      return all;
    }

    /* ── Instance configuration ───────────────────────────────────────── */

    tabGroups = { primary: "overview" };
    _filters  = {};

    /* ── Accessors ────────────────────────────────────────────────────── */

    /** @override */
    get title() {
      return this.actor.name ?? game.i18n.localize("SHIPCOMBAT.DND5E.Sheet.PlayerShip");
    }

    /* ── Context preparation ──────────────────────────────────────────── */

    /**
     * Stub out NPC-specific fields that ShipModel doesn't have so
     * the header template renders safely.
     * @override
     */
    async _prepareHeaderContext(context, options) {
      context.portrait            = await this._preparePortrait(context);
      context.abilities           = [];
      context.legact              = [];
      context.legres              = [];
      context.hasLegendaries      = false;
      context.hasClasses          = false;
      context.showDeathSaves      = false;
      context.showInitiativeScore = false;
      context.showLoyalty         = false;
      context.showRests           = false;
      context.modernRules         = false;
      context.internalFire        = this.actor.system.internalFire ?? 0;

      // Captain's skill modifier — drives the initiative badge value and the
      // rollInitiative click handler on the portrait.
      context.captainInitMod = 0;
      try {
        const { SystemAdapter } = globalThis.ShipCombat._api;
        const adapter = SystemAdapter?.current;
        if (adapter) {
          const sys = adapter.getShipData(this.actor);
          const captainRef = sys?.crewActors?.captain;
          if (captainRef?.uuid) {
            const captainActor = await fromUuid(captainRef.uuid);
            if (captainActor) {
              const roleSkill = sys.roleSkillOverrides?.captain ?? "leadership";
              const { key } = adapter.resolveSkill(roleSkill);
              context.captainInitMod = adapter.getSkillScore(captainActor, key) ?? 0;
            }
          }
        }
      } catch {}

      // Per-sector shield overcharge flag: true when current shield > zone threshold.
      // context.sectors is populated by ShipController.buildContext (already merged).
      const sectors = context.sectors ?? [];
      context.shieldOvercharged = Object.fromEntries(
        sectors.map(s => [s.id, s.shield > s.zoneThreshold])
      );

      return context;
    }

    /**
     * Prepare sidebar context for the custom player-ship-sidebar.hbs template.
     * We call _prepareTraits() so resistances / immunities / vulnerabilities
     * show real data, then stub out the fields the custom template doesn't use
     * (speed, skills, senses, habitat, gear, treasure) to avoid any accidental
     * rendering.  We do NOT call super — the native NPCActorSheet version would
     * crash on missing ShipModel fields (attributes.movement, attributes.senses).
     * @override
     */
    async _prepareSidebarContext(context, options) {
      // Traits: resistances / immunities / vulnerabilities / damage modification.
      try { context.traits = this._prepareTraits(context); }
      catch (e) { context.traits = {}; }
      // Fields not rendered by player-ship-sidebar.hbs — stub to be safe.
      context.speed     = [];
      context.skills    = [];
      context.senses    = [];
      context.habitat   = undefined;
      context.gear      = undefined;
      context.treasure  = undefined;
      context.important = this.actor.system.traits?.important ?? false;
      return context;
    }

    /* ── Rendering ────────────────────────────────────────────────────── */

    /**
     * Wire a single delegated dragstart listener for embedded ship item rows.
     * Called once per app lifetime (unlike _onRender which fires per render).
     * @override
     */
    _attachFrameListeners() {
      super._attachFrameListeners();
      this.element.addEventListener("dragstart", event => {
        const row = event.target.closest(".list-row[data-uuid], .shipcombat-ov-comp-row[data-uuid]");
        if (!row) return;
        const uuid = row.dataset.uuid;
        if (!uuid) return;
        const item = fromUuidSync(uuid);
        if (!item) return;
        event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
      });
    }

    /**
     * Call BaseActorSheet._onRender directly (skips NPCActorSheet._onRender
     * which calls _renderCreateInventory / _renderAttunement and crashes on
     * ShipModel), then let the mixin wire its role-tab event handlers.
     * @override
     */
    async _onRender(context, options) {
      await _BaseActorSheet.prototype._onRender.call(this, context, options);
      this.controller?.onRender(this.element, context, options);
      // Make embedded ship item rows draggable (config tab component inventory).
      // Disable the browser's default image dragging inside each row so the row
      // itself (not the thumbnail) is always the drag source.
      this.element.querySelectorAll(".list-row[data-uuid], .shipcombat-ov-comp-row[data-uuid]").forEach(row => {
        row.draggable = true;
        row.querySelectorAll("img").forEach(img => { img.draggable = false; });
      });
    }

    /** @override — ships have no inventory toolbar. */
    _renderCreateInventory() {}

    /** @override — ships do not attune items. */
    _renderAttunement() {}

    /* ── Configuration popups ─────────────────────────────────────────── */

    /**
     * Intercept the native showConfiguration handler.
     * Return false to suppress default behaviour (e.g. for unknown keys),
     * or handle our custom config keys here.
     * @override
     */
    _showConfiguration(event, target) {
      if (target.dataset.config === "starshipType") {
        if (ClassificationConfigApp) {
          this._renderChild(new ClassificationConfigApp({ document: this.actor }));
        }
        return false;
      }
      if (target.dataset.config === "hitPoints") {
        if (HitPointsConfigApp) {
          this._renderChild(new HitPointsConfigApp({ document: this.actor }));
        }
        return false;
      }
      if (target.dataset.config === "armorClass") {
        if (ArmorClassConfigApp) {
          this._renderChild(new ArmorClassConfigApp({ document: this.actor }));
        }
        return false;
      }
      // Let the parent handle everything else
    }
  }

  return PlayerShipSheet;
}
