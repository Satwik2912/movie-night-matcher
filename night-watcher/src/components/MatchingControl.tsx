import { useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { continueMatching, startMatching } from '../services/rooms'
import type { RoomStatus } from '../types/room'

type MatchingControlProps = {
  roomId: string
  isHost: boolean
  status?: RoomStatus
}

export function MatchingControl({ roomId, isHost, status }: MatchingControlProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  if (status === 'matching') return <span className="matching-status"><i /> Matching started</span>
  if (!isHost) return <span className="matching-status">Host is setting the queue</span>

  async function handleStart() {
    setPending(true)
    setError('')
    try {
      if (status === 'matched') await continueMatching(roomId)
      else await startMatching(roomId)
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Unable to start matching.')
    } finally {
      setPending(false)
    }
  }

  return <span className="matching-control"><button className="start-matching" onClick={handleStart} disabled={pending}><Clapperboard size={15} />{pending ? 'Finding films...' : status === 'matched' ? 'Start another round' : 'Start matching'}</button>{error && <small>{error}</small>}</span>
}