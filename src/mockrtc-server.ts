import { MockRTC, MockRTCPeerBuilder } from "./mockrtc";
import { MockRTCPeer, MockRTCServerPeer } from "./mockrtc-peer";
import { MockRTCHandlerBuilder } from "./handling/handler-builder";
import { HandlerStep } from "./handling/handler-steps";

export class MockRTCServer implements MockRTC {

    async start(): Promise<void> {}
    async stop(): Promise<void> {}

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    buildPeerFromData = async (handlerSteps: HandlerStep[]): Promise<MockRTCServerPeer> => {
        const peer = new MockRTCServerPeer(handlerSteps);
        this._activePeers.push(peer);
        return peer;
    }

    private _activePeers: MockRTCServerPeer[] = [];
    get activePeers(): Readonly<MockRTCPeer[]> {
        return [...this._activePeers];
    }

}