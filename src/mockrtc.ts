/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockRTCHandlerBuilder } from "./handling/handler-builder";
import type { ConnectionMetadata, MockRTCPeer } from "./mockrtc-peer";

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

    /**
     * Define a rule that will match any new connection that initially negotiates
     * a data channel.
     *
     * This rule definition changes the behaviour of the matching peer (as returned
     * by `getMatchingPeer()`) it does not create and return a new peer. The rule
     * is not defined until a `.thenX()` method is called, and the returned promise
     * resolves successfully.
     */
    forDataConnections(): MockRTCHandlerBuilder<void>;

    /**
     * Define a rule that will match any new connection that initially negotiates
     * a video track.
     *
     * This rule definition changes the behaviour of the matching peer (as returned
     * by `getMatchingPeer()`) it does not create and return a new peer. The rule
     * is not defined until a `.thenX()` method is called, and the returned promise
     * resolves successfully.
     */
    forVideoConnections(): MockRTCHandlerBuilder<void>;

    /**
     * Define a rule that will match any new connection that initially negotiates
     * an audio track.
     *
     * This rule definition changes the behaviour of the matching peer (as returned
     * by `getMatchingPeer()`) it does not create and return a new peer. The rule
     * is not defined until a `.thenX()` method is called, and the returned promise
     * resolves successfully.
     */
    forAudioConnections(): MockRTCHandlerBuilder<void>;

    /**
     * Define a rule that will match any new connection that initially negotiates
     * either any media (either audio or video) track.
     *
     * This rule definition changes the behaviour of the matching peer (as returned
     * by `getMatchingPeer()`) it does not create and return a new peer. The rule
     * is not defined until a `.thenX()` method is called, and the returned promise
     * resolves successfully.
     */
    forMediaConnections(): MockRTCHandlerBuilder<void>;

    start(): Promise<void>;

    stop(): Promise<void>;

    on<E extends MockRTCEvent>(event: E, callback: (param: MockRTCEventData[E]) => void): Promise<void>;

}