/**
 * Flat-only Armor Class configuration for NPC ships.
 *
 * NPC AC is a GM-authored value stored at system.attributes.ac.flat. The
 * model mirrors it to attributes.ac.value during derived-data preparation so
 * dnd5e's native NPC header and targeting API see the same value.
 */

const MODULE_ID = "causodes-shipcombat-dnd5e";

export class NpcShipArmorClassConfig {
  static build() {
    const ArmorClassConfig = globalThis.dnd5e?.applications?.actor?.ArmorClassConfig;
    if (!ArmorClassConfig) {
      console.warn(`${MODULE_ID} | ArmorClassConfig not found — NPC ship AC config popup unavailable.`);
      return null;
    }

    return class NpcShipArmorClassConfigApp extends ArmorClassConfig {
      static PARTS = {
        config: {
          template: `modules/${MODULE_ID}/templates/actor/npc/armor-class-config.hbs`,
        },
      };

      async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        context.value = this.document.system.attributes?.ac?.flat ?? 0;
        return context;
      }
    };
  }
}
