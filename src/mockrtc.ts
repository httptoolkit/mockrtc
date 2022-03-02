import type { MockRTCHandlerBuilder } from "./mockrtc-handler-builder";
import type { MockRTCPeer } from "./mockrtc-peer";

export type MockRTCPeerBuilder = MockRTCHandlerBuilder<MockRTCPeer>;

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