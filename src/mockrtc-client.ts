import gql from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

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
                    steps: handlerSteps
                }
            },
            transformResponse: ({ createPeer }) => createPeer
        });

        const { id } = peerData;

        return new MockRTCRemotePeer(
            id,
            this.getPeerOfferClient(id),
            this.getPeerMessagesClient(id)
        );
    }

    private getPeerOfferClient(id: string) {
        return (offer: RTCSessionDescriptionInit) => {
            return this.adminClient.sendQuery<
                { getSessionDescription: RTCSessionDescriptionInit },
                RTCSessionDescriptionInit
            >({
                query: gql`
                    mutation GetPeerRTCAnswer($id: ID!, $offer: RTCOffer!) {
                        getSessionDescription(peerId: $id, offer: $offer) {
                            type
                            sdp
                        }
                    }
                `,
                variables: { id, offer },
                transformResponse: ({ getSessionDescription }) => getSessionDescription
            });
        }
    }

    private getPeerMessagesClient(id: string) {
        return (channelName?: string) => {
            return this.adminClient.sendQuery<
                { getSeenMessages: Array<string | { type: 'buffer', value: string }> },
                Array<string | Buffer>
            >({
                query: gql`
                    query GetPeerSeenMessages($id: ID!, $channelName: String) {
                        getSeenMessages(peerId: $id, channelName: $channelName)
                    }
                `,
                variables: { id, channelName },
                transformResponse: ({ getSeenMessages }) => {
                    return getSeenMessages.map((message) => {
                        if (typeof message === 'string') {
                            return message;
                        } else if (message.type === 'buffer') {
                            return Buffer.from(message.value, 'base64');
                        } else {
                            throw new Error(`Unparseable message data: ${JSON.stringify(message)}`);
                        }
                    });
                }
            });
        }
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