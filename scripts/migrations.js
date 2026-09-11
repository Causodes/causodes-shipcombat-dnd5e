const MODULE_ID = "causodes-shipcombat-dnd5e";
const SHIP_TYPE = `${MODULE_ID}.ship`;
const NPC_SHIP_TYPE = `${MODULE_ID}.npcShip`;
const ORDNANCE_TYPE = `${MODULE_ID}.shipOrdnance`;
const ORDNANCE_TRAIT_KEYS = ["rend", "armourPenetration", "shieldBurn", "shieldBypass"];

/** Build the replacement type/system for one legacy unified starship snapshot. */
export function buildLegacyStarshipMigration(source = {}, knownKeysByType = {}) {
  const modeToType = {
    player: SHIP_TYPE,
    npc: NPC_SHIP_TYPE,
    ordnance: ORDNANCE_TYPE,
  };
  const newType = modeToType[source.shipMode] ?? SHIP_TYPE;
  const system = structuredClone(source);
  delete system.shipMode;

  const knownKeys = new Set(knownKeysByType[newType] ?? []);
  for (const key of Object.keys(system)) {
    if (!knownKeys.has(key)) delete system[key];
  }
  if (newType !== ORDNANCE_TYPE && system.traits) {
    for (const key of ORDNANCE_TRAIT_KEYS) delete system.traits[key];
  }
  if (newType === NPC_SHIP_TYPE) delete system.resources;
  if (newType === ORDNANCE_TYPE) system.hull = { value: 1, max: 1 };

  return { newType, system };
}
