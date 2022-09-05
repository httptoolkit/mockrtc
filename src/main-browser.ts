/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
    MockRTC,
    MockRTCOptions,
} from "./mockrtc";
import { MockRTCClient, MockRTCClientOptions } from "./client/mockrtc-client";

// Export the required structures to remotely build and send rules to the admin API:
export * as HandlerStepDefinitions from "./handling/handler-step-definitions";
export * as MatcherDefinitions from "./matching/matcher-definitions";
export { MockRTCAdminRequestBuilder } from "./client/mockrtc-admin-request-builder";

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
    hookWebRTCConnection,
    hookAllWebRTC
} from "./webrtc-hooks";

export function getLocal(): MockRTC {
    return new MockRTCClient();
}

export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}

export function getAdminServer(): never {
    throw new Error("Can't use MockRTC.getLocal() in a browser");
}
