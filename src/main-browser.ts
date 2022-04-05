/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    MockRTCOptions,
} from "./mockrtc";
import { MockRTCClient, MockRTCClientOptions } from "./client/mockrtc-client";

export type {
    MockRTC,
    MockRTCOptions
};

export type {
    MockRTCPeer,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams
} from './mockrtc-peer';

export { MOCKRTC_CONTROL_CHANNEL } from './webrtc/control-channel';
export { hookWebRTCPeer } from "./webrtc-hooks";

export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}