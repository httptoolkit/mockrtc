/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockRTCHandlerBuilder } from "./handling/handler-builder";
import { HandlerStepDefinition } from "./handling/handler-step-definitions";
import { MatcherDefinition } from "./matching/matcher-definitions";
import type { ConnectionMetadata, MockRTCPeer } from "./mockrtc-peer";
import { MockRTCRuleBuilder } from "./rule-builder";

export interface MockRTCPeerBuilder extends MockRTCHandlerBuilder<MockRTCPeer> {}

export interface MockRTCOptions {

    /**
     * Should the server print extra debug information?
     */
    debug?: boolean;

    /**
     * Whether or not all DataChannel messages should be saved for later examination.
     * This can be useful in quick testing, but may use large amounts of data if
     * enabled when proxying lots of traffic.
     *
     * Defaults to false.
     */
    recordMessages?: boolean;
}

export interface MockRTCSessionDescription {
    type: 'offer' | 'answer';
    sdp: string;
}

export interface SelectedRTCCandidate {
    address: string;
    port: number;
    protocol: 'udp' | 'tcp';
    type: RTCIceCandidateType;
};

export interface TimingEvents {
    // Milliseconds since unix epoch
    startTime: number;

    // High-precision floating-point monotonically increasing timestamps.
    // Comparable and precise, but not related to specific current time.
    connectTimestamp: number;
    disconnectTimestamp?: number;
    externalAttachTimestamp?: number;

    // Other events (everything that might not be a on-off) each come with their
    // eventTimestamp property for that specific event.
}

export type MockRTCEventData = {
    "peer-connected": {
        peerId: string;
        sessionId: string;
        metadata: ConnectionMetadata;
        localSessionDescription: MockRTCSessionDescription;
        remoteSessionDescription: MockRTCSessionDescription;
        selectedLocalCandidate: SelectedRTCCandidate;
        selectedRemoteCandidate: SelectedRTCCandidate;

        timingEvents: TimingEvents;
    },
    "peer-disconnected": {
        peerId: string;
        sessionId: string;

        timingEvents: TimingEvents;
    },
    "external-peer-attached": {
        peerId: string;
        sessionId: string;
        externalConnection: {
            peerId: string;
            sessionId: string;
            localSessionDescription: MockRTCSessionDescription;
            remoteSessionDescription: MockRTCSessionDescription;
            selectedLocalCandidate: SelectedRTCCandidate;
            selectedRemoteCandidate: SelectedRTCCandidate;
        };
        timingEvents: TimingEvents;
    },
    "data-channel-opened": {
        peerId: string;
        sessionId: string;
        channelId: number;
        channelLabel: string;
        channelProtocol: string;

        eventTimestamp: number;
        timingEvents: TimingEvents;
    },
    "data-channel-message-sent": {
        peerId: string;
        sessionId: string;
        channelId: number;
        direction: 'sent';
        content: Buffer;
        isBinary: boolean;

        eventTimestamp: number;
        timingEvents: TimingEvents;
    },
    "data-channel-message-received": {
        peerId: string;
        sessionId: string;
        channelId: number;
        direction: 'received';
        content: Buffer;
        isBinary: boolean;

        eventTimestamp: number;
        timingEvents: TimingEvents;
    },
    "data-channel-closed": {
        peerId: string;
        sessionId: string;
        channelId: number;

        eventTimestamp: number;
        timingEvents: TimingEvents;
    }
    "media-track-opened": {
        peerId: string;
        sessionId: string;
        trackMid: string;
        trackType: string;
        trackDirection: string;

        eventTimestamp: number;
        timingEvents: TimingEvents;
    },
    "media-track-stats": {
        peerId: string;
        sessionId: string;
        trackMid: string;

        totalBytesSent: number;
        totalBytesReceived: number;

        eventTimestamp: number;
        timingEvents: TimingEvents;
    },
    "media-track-closed": {
        peerId: string;
        sessionId: string;
        trackMid: string;

        eventTimestamp: number;
        timingEvents: TimingEvents;
    }
};

export type MockRTCEvent = keyof MockRTCEventData;

export type MockRTCRuleDefinition = {
    matchers: MatcherDefinition[];
    steps: HandlerStepDefinition[];
};

export interface MockRTC {

    /**
     * Start creating a mock WebRTC peer. This method returns a builder, who
     * must be configured with the mock peer's settings. Once configured the
     * peer can be created by calling any `.thenX()` method to define the
     * peer's behaviour.
     *
     * This API allows you to define a single set of handling steps, and then
     * connect directly to the resulting peer to run those steps directly.
     *
     * To instead define multiple behaviours that match different conditions, and
     * then connect clients who may each see different behaviour, define your
     * rules using the `forX()` methods, and connect by using `getMatchingPeer()`.
     */
    buildPeer(): MockRTCPeerBuilder;

    /**
     * Starting defining a mock WebRTC rule. This methods returns a rule builder,
     * which can be configured to define which incoming connections should be
     * matched, with methods like `.fromPageHostname(hostname)`.
     *
     * Once the matching is configured, start calling handler methods like
     * `.send()` to define a series of steps to run for matching connections,
     * and then call a `.thenX()` method to complete the definition and
     * define the rule.
     *
     * The rule definition is not complete until the returned promise resolves.
     * Once it has resolved successfully, any future connections to the peer
     * returned by `getMatchingPeer()` will be matched against these rules,
     * and will run the steps for the first matching rule found.
     */
    forConnections(): MockRTCRuleBuilder;

    /**
     * Get the rule-matching peer.
     *
     * This peer accepts connections, matches them against defined rules (defined
     * via the `.forX()` methods) and then handles them according to the steps
     * for the defined rule.
     *
     * To more directly define a set of steps and make a connection that will
     * follow those steps, define a peer with `.buildPeer()` and then connect
     * to that directly.
     *
     * The default behaviour of this peer for unmatched connections is equivalent
     * to `.thenPassThrough()` - it will accept all incoming data without response
     * initially, and proxy all data to a remote peer if one is attached.
     */
    getMatchingPeer(): MockRTCPeer;

    start(): Promise<void>;

    stop(): Promise<void>;

    /**
     * Subscribe to events to monitor WebRTC interactions across all peers managed by
     * this MockRTC session. The events available include:
     *
     * - `peer-connected`
     * - `peer-disconnected`
     * - `external-peer-attached`
     * - `data-channel-opened`
     * - `data-channel-message-sent`
     * - `data-channel-message-received`
     * - `data-channel-closed`
     * - `media-track-opened`
     * - `media-track-stats`
     * - `media-track-closed`
     */
    on<E extends MockRTCEvent>(event: E, callback: (param: MockRTCEventData[E]) => void): Promise<void>;

    /**
     * Create a peer from a set of step definitions.
     *
     * This API is only useful if you're building peers from data programmatically,
     * rather than using `buildPeer()` and `MockRTCPeerBuilder`, which are generally
     * preferable otherwise.
     */
    buildPeerFromDefinition(
        handlerStepDefinitions: HandlerStepDefinition[]
    ): Promise<MockRTCPeer>;

    /**
     * Create a connection-matching rule from a set of matchers and step definitions.
     *
     * This API is only useful if you're building rule from data programmatically,
     * rather than using `forX()` and `MockRTCHandlerBuilder`, which are generally
     * preferable otherwise.
     */
    addRuleFromDefinition(
        matcherDefinitions: MatcherDefinition[],
        handlerStepDefinitions: HandlerStepDefinition[]
    ): Promise<void>;

    /**
     * Create a connection-matching rule from a set of matchers and step definitions.
     *
     * This API is only useful if you're building rule from data programmatically,
     * rather than using `forX()` and `MockRTCHandlerBuilder`, which are generally
     * preferable otherwise.
     */
    setRulesFromDefinitions(rules: Array<MockRTCRuleDefinition>): Promise<void>;

}