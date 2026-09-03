import { ExternalLink, Play } from 'lucide-react'

type MovieAvailabilityProps = {
  trailerUrl?: string
  providers?: string[]
}

export function MovieAvailability({ trailerUrl, providers = [] }: MovieAvailabilityProps) {
  return <div className="movie-availability"><div className="provider-row"><span>Where to watch</span>{providers.length ? providers.slice(0, 4).map((provider) => <b key={provider}>{provider}</b>) : <small>Availability unavailable in this region</small>}</div>{trailerUrl && <a className="trailer-link" href={trailerUrl} target="_blank" rel="noreferrer"><Play size={13} fill="currentColor" /> Watch trailer <ExternalLink size={12} /></a>}</div>
}
