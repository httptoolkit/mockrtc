/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
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
    MockRTCSession,
    MockRTCOfferParams,
    MockRTCAnswerParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams,
    OfferOptions,
    AnswerOptions
} from './mockrtc-peer';

export { MOCKRTC_CONTROL_CHANNEL } from './webrtc/control-channel';
export {
    hookWebRTCPeer,
    hookAllWebRTC
} from "./webrtc-hooks";

export function getLocal(): never {
    throw new Error("Can't use MockRTC.getLocal() in a browser");
}

export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}

export function getAdminServer(): never {
    throw new Error("Can't use MockRTC.getLocal() in a browser");
}
