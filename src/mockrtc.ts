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
    type: string;
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
     */
    buildPeer(): MockRTCPeerBuilder;

    start(): Promise<void>;

    stop(): Promise<void>;

    on<E extends MockRTCEvent>(event: E, callback: (param: MockRTCEventData[E]) => void): Promise<void>;

}