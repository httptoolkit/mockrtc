import gql from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';
import { serialize } from 'mockttp/dist/util/serialization';

import { MockRTC, MockRTCOptions, MockRTCPeerBuilder } from "./mockrtc";

import { MockRTCAdminPlugin } from "./mockrtc-admin-plugin";
import type { MockRTCPeer } from './mockrtc-peer';
import { MockRTCRemotePeer } from './mockrtc-remote-peer';
import { MockRTCHandlerBuilder } from './handling/handler-builder';
import { HandlerStep } from './handling/handler-steps';

export type MockRTCClientOptions =
    PluggableAdmin.AdminClientOptions &
    MockRTCOptions;

export class MockRTCClient implements MockRTC {

    private adminClient: PluggableAdmin.AdminClient<{ webrtc: MockRTCAdminPlugin }>;

    constructor(
        private options: MockRTCClientOptions = {}
    ) {
        this.adminClient = new PluggableAdmin.AdminClient(options);
    }

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    private buildPeerFromData = async (handlerSteps: HandlerStep[]): Promise<MockRTCPeer> => {
        const { adminStream } = this.adminClient;

        const peerData = await this.adminClient.sendQuery<
            { createPeer: { id: string } },
            { id: string }
        >({
            query: gql`
                mutation CreatePeer($peerData: RTCHandlerData!) {
                    createPeer(data: $peerData) {
                        id
                    }
                }
            `,
            variables: {
                peerData: {
                    steps: handlerSteps.map(step => serialize(step, adminStream))
                }
            },
            transformResponse: ({ createPeer }) => createPeer
        });

        const { id } = peerData;

        return new MockRTCRemotePeer(id, this.adminClient);
    }

    async start(): Promise<void> {
        await this.adminClient.start({
            webrtc: this.options
        });
    }

    async stop(): Promise<void> {
        await this.adminClient.stop();
    }
}