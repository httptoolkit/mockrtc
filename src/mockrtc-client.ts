import gql from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

import { MockRTC, MockRTCPeerBuilder } from "./mockrtc";

import { MockRTCAdminPlugin } from "./mockrtc-admin-plugin";
import { HandlerStep, MockRTCHandlerBuilder } from './mockrtc-handler-builder';

import type { MockRTCPeer } from './mockrtc-peer';
import { MockRTCRemotePeer } from './mockrtc-remote-peer';

export type MockRTCClientOptions = PluggableAdmin.AdminClientOptions;

export class MockRTCClient implements MockRTC {

    private adminClient: PluggableAdmin.AdminClient<{ webrtc: MockRTCAdminPlugin }>;

    constructor() {
        this.adminClient = new PluggableAdmin.AdminClient();
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

        return new MockRTCRemotePeer(id, this.getPeerClient(id));
    }

    private getPeerClient(id: string) {
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

    async start(): Promise<void> {
        await this.adminClient.start({
            webrtc: {}
        });
    }

    async stop(): Promise<void> {
        await this.adminClient.stop();
    }
}