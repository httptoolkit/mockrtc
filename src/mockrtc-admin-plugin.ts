import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

import { HandlerStep, StepLookup } from './handling/handler-steps';
import { MockRTCOptions } from './mockrtc';
import { MockRTCServer } from './mockrtc-server';

export class MockRTCAdminPlugin implements PluggableAdmin.AdminPlugin<MockRTCOptions, {}> {

    private mockRTCServer!: MockRTCServer;

    start(options: MockRTCOptions) {
        this.mockRTCServer = new MockRTCServer(options);
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
            steps: [Raw!]!
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

        extend type Query {
            getSeenMessages(peerId: ID!, channelName: String): [Raw!]
        }

        scalar HandlerStep
    `;

    buildResolvers() {
        return {
            Mutation: {
                createPeer: (__: any, { data: { steps } }: { data: { steps: Array<HandlerStep> } }) => {
                    return this.mockRTCServer.buildPeerFromData(
                        steps.map(deserializeStepData)
                    );
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
            },
            Query: {
                getSeenMessages: async (__: any, { peerId, channelName }: {
                    peerId: string,
                    channelName?: string
                }) => {
                    const peer = this.mockRTCServer.activePeers.find(({ id }) => id === peerId);
                    if (!peer) throw new Error("Id matches no active peer");

                    const messages = await (channelName != undefined
                        ? peer.getMessagesOnChannel(channelName)
                        : peer.getAllMessages()
                    );

                    return messages.map((message) => {
                        if (Buffer.isBuffer(message)) {
                            return { type: 'buffer', value: message.toString('base64') };
                        } else {
                            return message;
                        }
                    });
                }
            }
        };
    }
}

function deserializeStepData(
    data: { type: keyof typeof StepLookup }
) {
    const type = StepLookup[data.type];
    return Object.assign(Object.create(type.prototype), data);
}