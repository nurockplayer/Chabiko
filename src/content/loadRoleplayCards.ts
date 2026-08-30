import type { RoleplayCardRecord } from '../types/roleplayCard';
import airportData from '../../data/roleplay/airport.json';
import transportData from '../../data/roleplay/transport.json';
import foodData from '../../data/roleplay/food.json';
import shoppingData from '../../data/roleplay/shopping.json';
import hotelData from '../../data/roleplay/hotel.json';
import emergencyData from '../../data/roleplay/emergency.json';

/** Exact prelaunch allowlist owned by Issue #250. */
export const ROLEPLAY_LAUNCH_CARD_IDS = [
  'roleplay-airport-001',
  'roleplay-transport-001',
  'roleplay-food-001',
  'roleplay-shopping-001',
  'roleplay-hotel-001',
  'roleplay-emergency-001',
] as const;

function collectionOf(data: unknown, key: string): RoleplayCardRecord[] {
  const parsed = data as Record<string, unknown>;
  const value = parsed[key];
  if (!Array.isArray(value)) {
    throw new Error(`Roleplay loader: expected '${key}' array in content file.`);
  }
  return value as RoleplayCardRecord[];
}

/** Load all scenario-owned roleplay cards in the established source order. */
export function loadRoleplayCards(): readonly RoleplayCardRecord[] {
  return [
    ...collectionOf(airportData, 'roleplayCards'),
    ...collectionOf(transportData, 'roleplayCards'),
    ...collectionOf(foodData, 'roleplayCards'),
    ...collectionOf(shoppingData, 'roleplayCards'),
    ...collectionOf(hotelData, 'roleplayCards'),
    ...collectionOf(emergencyData, 'roleplayCards'),
  ];
}

/**
 * Return only the six cards explicitly allowlisted for the #438 prelaunch
 * learner surface. The full loader remains unchanged for graph and review
 * consumers, including its transport fixture.
 */
export function loadPrelaunchRoleplayCards(): readonly RoleplayCardRecord[] {
  const cards = loadRoleplayCards();
  const byId = new Map(cards.map((card) => [card.id, card]));
  const selected = ROLEPLAY_LAUNCH_CARD_IDS.map((id) => byId.get(id));
  if (selected.some((card) => card === undefined)) {
    throw new Error('Roleplay prelaunch allowlist is incomplete; refusing to expose cards.');
  }
  return selected as RoleplayCardRecord[];
}
