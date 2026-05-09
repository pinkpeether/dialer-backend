export type CallStatus =
  | 'INITIATED'
  | 'RINGING'
  | 'ANSWERED'
  | 'NO_ANSWER'
  | 'FAILED'
  | 'COMPLETED'

/**
 * Common call event emitted by providers to indicate progress of a call.
 * An event may include arbitrary metadata from the underlying provider.
 */
export interface CallEvent {
  /**
   * High‑level type for the event. Your application may choose to emit
   * additional event types beyond these core ones.
   */
  type: 'status' | 'ringing' | 'answered' | 'completed'
  /**
   * ISO date when the event occurred on the provider side.
   */
  timestamp: Date
  /**
   * Provider‑specific payload for the event. Use this sparingly and
   * prefer to map provider fields into first‑class properties instead.
   */
  metadata?: Record<string, any>
}

/**
 * Structure returned by a CallProvider when a call is initiated. The
 * providerCallId corresponds to the identifier returned from the
 * underlying telephony platform (e.g. Twilio SID) and should be
 * persisted in the Call model for future status lookups.
 */
export interface CallResult {
  /**
   * Internal call record ID. Typically the ID of the Call model in
   * your database.
   */
  callId: string
  /**
   * Provider specific call identifier (Twilio SID, Vonage UUID, etc).
   */
  providerCallId: string
  /**
   * Initial status of the call right after initiation.
   */
  status: CallStatus
}

/**
 * A CallProvider defines the minimal interface required to initiate
 * and control phone calls. Implementations must encapsulate all
 * vendor‑specific SDKs so that the rest of the codebase never
 * references Twilio, Vonage, Plivo, etc. directly. Adding support
 * for a new provider should only require a new class implementing
 * this interface and a corresponding entry in the factory.
 */
export interface CallProvider {
  /**
   * Start an outbound call.
   *
   * @param to Phone number to dial in E.164 format (e.g. +18005550123)
   * @param from Caller ID / phone number used for the call
   * @param metadata Additional metadata (campaignId, contactId, etc.)
   */
  startOutboundCall(to: string, from: string, metadata: Record<string, any>): Promise<CallResult>
  /**
   * Hang up a live call. After calling this the call should be
   * terminated immediately.
   *
   * @param callId Provider specific call identifier (e.g. Twilio SID)
   */
  hangupCall(callId: string): Promise<void>
  /**
   * Mute a live call so that the remote party cannot hear the agent.
   *
   * @param callId Provider specific call identifier
   */
  muteCall(callId: string): Promise<void>
  /**
   * Unmute a previously muted call.
   *
   * @param callId Provider specific call identifier
   */
  unmuteCall(callId: string): Promise<void>
  /**
   * Retrieve the latest status of a call from the provider.
   *
   * @param callId Provider specific call identifier
   */
  getCallStatus(callId: string): Promise<CallStatus>
}