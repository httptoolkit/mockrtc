/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MockRTCHandlerBuilder } from "./handling/handler-builder";
import type { MockRTCPeer } from "./mockrtc-peer";

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

export type MockRTCEventData = {
    "peer-connected": {
        peerId: string;
        sessionId: string;
        localSdp: RTCSessionDescriptionInit;
        remoteSdp: RTCSessionDescriptionInit;
    },
    "peer-disconnected": {
        peerId: string;
        sessionId: string;
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