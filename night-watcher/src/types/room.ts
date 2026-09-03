export type RoomStatus = 'lobby' | 'matching' | 'matched' | 'ended'

export type RoomPreferences = {
  genres: string[]
  maxRuntime: number | null
  releaseYearFrom: number | null
  releaseYearTo: number | null
  includeAdult: boolean
}

export type Room = {
  id: string
  code: string
  hostId: string
  status: RoomStatus
  country: string
  round?: number
  matchedMovieId?: number | null
  preferences: RoomPreferences
  createdAt?: Date
  updatedAt?: Date
  endedAt?: Date | null
}

export type RoomMember = {
  id: string
  name: string
  email: string | null
  photoURL: string | null
  role: 'host' | 'member'
  joinedAt?: Date
  lastSeenAt?: Date
  isOnline: boolean
}