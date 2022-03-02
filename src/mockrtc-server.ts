import { MockRTC, MockRTCPeerBuilder } from "./mockrtc";
import { HandlerStep, MockRTCHandlerBuilder } from "./mockrtc-handler-builder";
import { MockRTCPeer } from "./mockrtc-peer";

export class MockRTCServer implements MockRTC {

    async start(): Promise<void> {}
    async stop(): Promise<void> {}

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    buildPeerFromData = async (handlerSteps: HandlerStep[]): Promise<MockRTCPeer> => {
        const peer = new MockRTCPeer();
        this._activePeers.push(peer);
        return peer;
    }

    private _activePeers: MockRTCPeer[] = [];
    get activePeers(): Readonly<MockRTCPeer[]> {
        return [...this._activePeers];
    }

}