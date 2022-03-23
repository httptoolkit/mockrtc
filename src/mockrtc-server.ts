import { MockRTC, MockRTCOptions, MockRTCPeerBuilder } from "./mockrtc";
import { MockRTCPeer } from "./mockrtc-peer";
import { MockRTCServerPeer } from "./mockrtc-server-peer";
import { MockRTCHandlerBuilder } from "./handling/handler-builder";
import { HandlerStep } from "./handling/handler-steps";

export class MockRTCServer implements MockRTC {

    constructor(
        private options: MockRTCOptions = {}
    ) {}

    async start(): Promise<void> {}
    async stop(): Promise<void> {
        await Promise.all(
            this._activePeers.map(peer =>
                peer.close()
            )
        );
    }

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    buildPeerFromData = async (handlerSteps: HandlerStep[]): Promise<MockRTCServerPeer> => {
        const peer = new MockRTCServerPeer(handlerSteps, this.options);
        this._activePeers.push(peer);
        return peer;
    }

    private _activePeers: MockRTCServerPeer[] = [];
    get activePeers(): Readonly<MockRTCPeer[]> {
        return [...this._activePeers];
    }

}