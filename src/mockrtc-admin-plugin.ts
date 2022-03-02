import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

import { HandlerStep } from './mockrtc-handler-builder';
import { MockRTCServer } from './mockrtc-server';

export class MockRTCAdminPlugin implements PluggableAdmin.AdminPlugin<{}, {}> {

    private mockRTCServer = new MockRTCServer();

    start() {
        return this.mockRTCServer.start();
    }

    reset() {}

    stop() {
        return this.mockRTCServer.stop();
    }

    schema = gql`
        extend type Mutation {
            createPeer(data: RTCHandlerData!): MockedPeer!
            getSessionDescription(peerId: ID!, offer: RTCOffer!): RTCAnswer!
        }

        input RTCHandlerData {
            steps: [Json!]!
        }

        type MockedPeer {
            id: ID!
        }

        input RTCOffer {
            type: String!
            sdp: String!
        }

        type RTCAnswer {
            type: String!
            sdp: String!
        }
    `;

    buildResolvers() {
        return {
            Mutation: {
                createPeer: (__: any, { steps }: { steps: Array<HandlerStep> }) => {
                    return this.mockRTCServer.buildPeerFromData(steps);
                },
                getSessionDescription: async (__: any, { peerId, offer } : {
                    peerId: string,
                    offer: RTCSessionDescriptionInit
                }): Promise<RTCSessionDescriptionInit> => {
                    const peer = this.mockRTCServer.activePeers.find(({ id }) => id === peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const result = await peer.getSessionDescription(offer);
                    return result.sessionDescription;
                }
            }
        };
    }
}