// The WebRTC control channel name & protocol used when communicating metadata to about client
// configuration, e.g. the external connection to bridge to.
export const MOCKRTC_CONTROL_CHANNEL = "mockrtc.control-channel";

// The type of valid messages that can be sent on a control channel:
export type MockRTCControLMessage =
    | { type: 'error', error: string }
    | { type: 'attach-external', id: string }