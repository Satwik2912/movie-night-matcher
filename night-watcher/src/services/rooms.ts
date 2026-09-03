import { collection, doc, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { Room, RoomMember, RoomPreferences } from '../types/room'
import type { QueueMovie } from '../types/movie'
import { db, functions } from './firebase'

type RoomResponse = { roomId: string; code: string }

const createRoomRequest = httpsCallable<{ country: string; preferences: RoomPreferences }, RoomResponse>(functions, 'createRoom')
const joinRoomRequest = httpsCallable<{ code: string }, RoomResponse>(functions, 'joinRoom')
const leaveRoomRequest = httpsCallable<{ roomId: string }, { success: true }>(functions, 'leaveRoom')
const endRoomRequest = httpsCallable<{ roomId: string }, { success: true }>(functions, 'endRoom')
const startMatchingRequest = httpsCallable<{ roomId: string }, { queueSize: number }>(functions, 'startMatching')
const castVoteRequest = httpsCallable<{ roomId: string; movieId: number; liked: boolean }, { matched: boolean }>(functions, 'castVote')
const continueMatchingRequest = httpsCallable<{ roomId: string }, { queueSize: number }>(functions, 'continueMatching')
const heartbeatRoomRequest = httpsCallable<{ roomId: string }, { success: true }>(functions, 'heartbeatRoom')

export const defaultRoomPreferences: RoomPreferences = {
  genres: [],
  maxRuntime: 150,
  releaseYearFrom: 2000,
  releaseYearTo: new Date().getFullYear(),
  includeAdult: false,
}

export async function createRoom(country: string, preferences = defaultRoomPreferences) {
  const response = await createRoomRequest({ country, preferences })
  return response.data
}

export async function joinRoom(code: string) {
  const response = await joinRoomRequest({ code: code.trim().toUpperCase() })
  return response.data
}

export async function leaveRoom(roomId: string) {
  await leaveRoomRequest({ roomId })
}

export async function endRoom(roomId: string) {
  await endRoomRequest({ roomId })
}

export async function startMatching(roomId: string) {
  const response = await startMatchingRequest({ roomId })
  return response.data
}

export async function castVote(roomId: string, movieId: number, liked: boolean) {
  const response = await castVoteRequest({ roomId, movieId, liked })
  return response.data
}

export function listenToRoom(roomId: string, callback: (room: Room | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'rooms', roomId), (snapshot) => {
    callback(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } as Room : null)
  })
}

export function listenToMembers(roomId: string, callback: (members: RoomMember[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'rooms', roomId, 'members'), (snapshot) => {
    callback(snapshot.docs.map((member) => ({ id: member.id, ...member.data() }) as RoomMember))
  })
}

export function listenToQueue(roomId: string, callback: (movies: QueueMovie[]) => void): Unsubscribe {
  return onSnapshot(query(collection(db, 'rooms', roomId, 'queue'), orderBy('order')), (snapshot) => {
    callback(snapshot.docs.map((movie) => ({ id: movie.id, ...movie.data() }) as QueueMovie))
  })
}

export async function continueMatching(roomId: string) {
  const response = await continueMatchingRequest({ roomId })
  return response.data
}

export function listenToMatches(roomId: string, callback: (matches: QueueMovie[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'rooms', roomId, 'matches'), (snapshot) => {
    callback(snapshot.docs.map((match) => ({ id: match.id, ...match.data().movie }) as QueueMovie))
  })
}

export async function heartbeatRoom(roomId: string) {
  await heartbeatRoomRequest({ roomId })
}