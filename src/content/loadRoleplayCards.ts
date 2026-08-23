import type { RoleplayCardRecord } from '../types/roleplayCard';
import airportData from '../../data/roleplay/airport.json';
import transportData from '../../data/roleplay/transport.json';
import foodData from '../../data/roleplay/food.json';
import shoppingData from '../../data/roleplay/shopping.json';
import hotelData from '../../data/roleplay/hotel.json';
import emergencyData from '../../data/roleplay/emergency.json';

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
