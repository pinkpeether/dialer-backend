export type TranscriptionResult = {
  text: string
  language?: string
  provider: string
}

export type SummaryResult = {
  summary: string
  provider: string
}

export type SentimentResult = {
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNKNOWN'
  score?: number
  provider: string
}

export const assertAiConfigured = () => {
  if (!process.env.AI_PROVIDER) {
    throw new Error('AI provider is not configured. Set AI_PROVIDER before enabling Phase 4.')
  }
}

export const transcribeRecording = async (_recordingUrl: string): Promise<TranscriptionResult> => {
  assertAiConfigured()
  throw new Error('Transcription provider adapter not implemented yet.')
}

export const summarizeTranscript = async (_text: string): Promise<SummaryResult> => {
  assertAiConfigured()
  throw new Error('AI summary provider adapter not implemented yet.')
}

export const scoreSentiment = async (_text: string): Promise<SentimentResult> => {
  assertAiConfigured()
  throw new Error('AI sentiment provider adapter not implemented yet.')
}
