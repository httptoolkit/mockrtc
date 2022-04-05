/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

// The WebRTC control channel name & protocol used when communicating metadata to about client
// configuration, e.g. the external connection to bridge to.
export const MOCKRTC_CONTROL_CHANNEL = "mockrtc.control-channel";

// The type of valid messages that can be sent on a control channel:
export type MockRTCControlMessage =
    | { type: 'error', error: string }
    | { type: 'attach-external', id: string }