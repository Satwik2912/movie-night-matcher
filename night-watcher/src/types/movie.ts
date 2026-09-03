export type QueueMovie = {
  id: string
  tmdbId: number
  title: string
  overview: string
  posterPath: string | null
  releaseYear: number | null
  rating: number
  runtime: number | null
  genres: string[]
  genreIds: number[]
  trailerKey: string | null
  providerNames: string[]
  order: number
}
