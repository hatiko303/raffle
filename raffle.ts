import { v4 as uuidv4 } from 'uuid'
import { Browser, Page } from 'playwright'

export interface Raffle {
  id: string
  streamLink: string
  codeWord: string
  title?: string
  description?: string
  participants: Set<string>
  active: boolean
  browser?: Browser
  page?: Page
  createdAt: Date
  ownerId: string // Добавляем владельца
}

export const raffles = new Map<string, Raffle>()

// Обновляем функцию createRaffle с 5 параметрами
export function createRaffle(
  streamLink: string,
  codeWord: string,
  title?: string,
  description?: string,
  ownerId?: string // 5-й параметр - владелец
): Raffle {
  const id = uuidv4()
  const raffle: Raffle = {
    id,
    streamLink,
    codeWord,
    title,
    description,
    participants: new Set(),
    active: true,
    createdAt: new Date(),
    ownerId: ownerId || 'anonymous' // По умолчанию anonymous
  }
  raffles.set(id, raffle)
  return raffle
}

export function stopRaffle(id: string): void {
  const raffle = raffles.get(id)
  if (raffle) {
    raffle.active = false
  }
}

export function getParticipants(id: string): string[] {
  const raffle = raffles.get(id)
  return raffle ? Array.from(raffle.participants) : []
}

export function getRaffle(id: string): Raffle | undefined {
  return raffles.get(id)
}

export function getAllRaffles(): Raffle[] {
  return Array.from(raffles.values())
}

// Новая функция для получения розыгрышей пользователя
export function getUserRaffles(userId: string): Raffle[] {
  return Array.from(raffles.values())
    .filter(raffle => raffle.ownerId === userId)
}

// Функция проверки прав доступа
export function hasAccessToRaffle(raffleId: string, userId: string): boolean {
  const raffle = raffles.get(raffleId)
  if (!raffle) return false
  return raffle.ownerId === userId || raffle.ownerId === 'anonymous'
}