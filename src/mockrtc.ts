import type { MockRTCHandlerBuilder } from "./handling/handler-builder";
import type { MockRTCPeer } from "./mockrtc-peer";

export type MockRTCPeerBuilder = MockRTCHandlerBuilder<MockRTCPeer>;

export interface MockRTCOptions {
    /**
     * Whether or not all DataChannel messages should be saved for later examination.
     * This can be useful in quick testing, but may use large amounts of data if
     * enabled when proxying lots of traffic.
     *
     * Defaults to false.
     */
    recordMessages?: boolean;
}

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

}

export interface MockRTCConnectionParams {
    sessionDescription: RTCSessionDescriptionInit;
}