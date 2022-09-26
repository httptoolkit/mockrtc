/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MockRTC,
    MockRTCOptions,
    MockRTCPeerBuilder,
    MockRTCEvent,
    MockRTCEventData,
    MockRTCRuleDefinition,
    MockRTCSessionDescription,
    SelectedRTCCandidate,
    TimingEvents
} from "./mockrtc";

import { MockRTCServer } from "./server/mockrtc-server";
import { MockRTCAdminServer } from "./server/mockrtc-admin-server";
export { MockRTCAdminPlugin } from "./server/mockrtc-admin-plugin";

import { MockRTCClient, MockRTCClientOptions } from "./client/mockrtc-client";

// Export the required structures to remotely build and send rules to the admin API:
export * as HandlerStepDefinitions from "./handling/handler-step-definitions";
export * as MatcherDefinitions from "./matching/matcher-definitions";
export { MockRTCAdminRequestBuilder } from "./client/mockrtc-admin-request-builder";

// Re-export lots of types are used in various APIs (mostly to make TypeDoc happy):
export type { HandlerStep } from "./handling/handler-steps";
export type { MockRTCHandlerBuilder } from "./handling/handler-builder";
export type { MockRTCRuleBuilder, RuleHandlerBuilder } from "./rule-builder";

export type { MockRTCServerPeer } from "./server/mockrtc-server-peer";
export type { SessionData } from "./server/mockrtc-admin-plugin";

export type { RTCConnection, ParsedSDP } from "./webrtc/rtc-connection";
export type { MockRTCConnection } from "./webrtc/mockrtc-connection";
export type { DataChannelStream } from "./webrtc/datachannel-stream";
export type { MediaTrackStream } from "./webrtc/mediatrack-stream";

export type { PluggableAdmin } from 'mockttp';

export type {
    MockRTC,
    MockRTCOptions,
    MockRTCClientOptions,
    MockRTCPeerBuilder,
    MockRTCAdminServer,
    MockRTCEvent,
    MockRTCEventData,
    MockRTCRuleDefinition,
    MockRTCSessionDescription,
    SelectedRTCCandidate,
    TimingEvents
};

export type {
    MockRTCPeer,
    MockRTCPeerOptions,
    MockRTCSession,
    MockRTCOfferParams,
    MockRTCAnswerParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams,
    OfferOptions,
    AnswerOptions,
    ConnectionMetadata
} from './mockrtc-peer';

export {
    MOCKRTC_CONTROL_CHANNEL,
    type MockRTCControlMessage
} from './webrtc/control-channel';
export {
    hookWebRTCConnection,
    hookAllWebRTC
} from "./webrtc-hooks";

/**
 * Get a MockRTC instance on the local machine.
 *
 * In most simple environments, you can call this method directly and immediately
 * get a MockRTC instance and start mocking peers.
 *
 * In node, the mocked peers will run in process and require no further setup.
 *
 * In browsers this is an alias for {@link getRemote}. You'll need to start a MockRTC
 * admin server outside your tests before calling this, which will create and manage
 * your fake peers outside the browser.
 *
 * @category API
 */
export function getLocal(): MockRTC {
    return new MockRTCServer();
}

/**
 * Get a MockRTC instance, managed by a MockRTC admin server running elsewhere.
 *
 * This connects to a MockRTC server, and uses that to start
 * and stop mock peers.
 *
 * @category API
 */
export function getRemote(options: MockRTCClientOptions = {}): MockRTC {
    return new MockRTCClient(options);
}

/**
 * Get a MockRTC admin server, which can be used with a MockRTC remote client to create
 * & manage mock peers either from remote machines or from local environments
 * that lack necessary capabilities, e.g. to use MockRTC from inside a browser.
 *
 * This function exists so you can set up these servers programmatically, but for most
 * usage you can just run your tests via the `mockrtc` binary, which will automatically
 * start and stop an admin server for you:
 *
 * ```
 * mockrtc -c <your test command>
 * ```
 *
 * @category API
 */
export function getAdminServer(): MockRTCAdminServer {
    return new MockRTCAdminServer();
}