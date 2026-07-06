// AGENCY OS palette — single source of colour truth
export const BG = '#161a23'
export const FLOOR = '#c9ced8'
export const FLOOR_DARK = '#b4bac6'
export const ZONE = {
  cyan: '#00e5ff',
  magenta: '#ff3df0',
  amber: '#ffb020',
  green: '#39ff8e',
} as const
export const VIOLET = '#8b5cf6'
export const VIOLET_DEEP = '#6d28d9'
export const RED = '#ff3355'
export const WHITE = '#f4f6fb'

export type ZoneKey = keyof typeof ZONE
