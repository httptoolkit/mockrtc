/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    MockRTCOptions,
} from "./mockrtc";
import { MockRTCServer } from "./server/mockrtc-server";
import { MockRTCAdminServer } from "./server/mockrtc-admin-server";
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

export {
    MOCKRTC_CONTROL_CHANNEL,
    type MockRTCControlMessage
} from './webrtc/control-channel';
export {
    hookWebRTCConnection,
    hookAllWebRTC
} from "./webrtc-hooks";

export function getLocal(): MockRTC {
    return new MockRTCServer();
}

export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}

export function getAdminServer(): MockRTCAdminServer {
    return new MockRTCAdminServer();
}