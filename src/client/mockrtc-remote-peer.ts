/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

import {
    MockRTCPeer,
    MockRTCOfferParams,
    MockRTCExternalOfferParams,
    MockRTCExternalAnswerParams,
    MockRTCAnswerParams,
    MockRTCSessionAPI
} from "../mockrtc-peer";
import type { SessionData } from '../server/mockrtc-admin-plugin';

export class MockRTCRemotePeer implements MockRTCPeer {

    constructor(
        readonly peerId: string,
        private adminClient: PluggableAdmin.AdminClient<{}>
    ) {}

    createOffer(): Promise<MockRTCOfferParams> {
        return this.adminClient.sendQuery<
            { createOffer: SessionData },
            MockRTCOfferParams
        >({
            query: gql`
                mutation GetPeerRTCOffer($peerId: ID!) {
                    createOffer(peerId: $peerId) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId },
            transformResponse: ({ createOffer }) => ({
                offer: createOffer.description,
                setAnswer: (answer) => this.completeOffer(createOffer.id, answer)
            })
        });
    }

    createExternalOffer(): Promise<MockRTCExternalOfferParams> {
        return this.adminClient.sendQuery<
            { createExternalOffer: SessionData },
            MockRTCExternalOfferParams
        >({
            query: gql`
                mutation GetPeerRTCExternalOffer($peerId: ID!) {
                    createExternalOffer(peerId: $peerId) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId },
            transformResponse: ({ createExternalOffer }) => ({
                id: createExternalOffer.id,
                offer: createExternalOffer.description,
                setAnswer: (answer) => this.completeOffer(createExternalOffer.id, answer)
            })
        });
    }

    private completeOffer = async (sessionId: string, answer: RTCSessionDescriptionInit) => {
        await this.adminClient.sendQuery<void>({
            query: gql`
                mutation CompletePeerRTCOffer(
                    $peerId: ID!,
                    $sessionId: ID!,
                    $answer: SessionDescriptionInput!
                ) {
                    completeOffer(peerId: $peerId, sessionId: $sessionId, answer: $answer)
                }
            `,
            variables: {
                peerId: this.peerId,
                sessionId,
                answer: answer
            }
        });

        return new RemoteSessionApi(this.adminClient, this.peerId, sessionId);
    }

    async answerOffer(offer: RTCSessionDescriptionInit): Promise<MockRTCAnswerParams> {
        return this.adminClient.sendQuery<
            { answerOffer: SessionData },
            MockRTCAnswerParams
        >({
            query: gql`
                mutation GetPeerRTCAnswer($peerId: ID!, $offer: SessionDescriptionInput!) {
                    answerOffer(peerId: $peerId, offer: $offer) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, offer },
            transformResponse: ({ answerOffer }) => ({
                answer: answerOffer.description,
                session: new RemoteSessionApi(this.adminClient, this.peerId, answerOffer.id)
            })
        });
    }

    async answerExternalOffer(offer: RTCSessionDescriptionInit): Promise<MockRTCExternalAnswerParams> {
        return this.adminClient.sendQuery<
            { answerExternalOffer: SessionData },
            MockRTCExternalAnswerParams
        >({
            query: gql`
                mutation GetPeerRTCExternalAnswer($peerId: ID!, $offer: SessionDescriptionInput!) {
                    answerExternalOffer(peerId: $peerId, offer: $offer) {
                        id
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, offer },
            transformResponse: ({ answerExternalOffer }) => ({
                id: answerExternalOffer.id,
                answer: answerExternalOffer.description
            })
        });
    }

    getAllMessages() {
        return this.adminClient.sendQuery<
            { getSeenMessages: Array<string | { type: 'buffer', value: string }> },
            Array<string | Buffer>
        >({
            query: gql`
                query GetPeerSeenMessages($peerId: ID!) {
                    getSeenMessages(peerId: $peerId)
                }
            `,
            variables: { peerId: this.peerId },
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

    getMessagesOnChannel(channelName: string): Promise<Array<string | Buffer>> {
        return this.adminClient.sendQuery<
            { getSeenMessages: Array<string | { type: 'buffer', value: string }> },
            Array<string | Buffer>
        >({
            query: gql`
                query GetPeerSeenMessages($peerId: ID!, $channelName: String) {
                    getSeenMessages(peerId: $peerId, channelName: $channelName)
                }
            `,
            variables: { peerId: this.peerId, channelName },
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

class RemoteSessionApi implements MockRTCSessionAPI {
    constructor(
        private adminClient: PluggableAdmin.AdminClient<{}>,
        private peerId: string,
        private sessionId: string
    ) {}

    createOffer(): Promise<RTCSessionDescriptionInit> {
        return this.adminClient.sendQuery<
            { createOffer: SessionData },
            RTCSessionDescriptionInit
        >({
            query: gql`
                mutation GetPeerRTCSessionOffer($peerId: ID!, $sessionId: ID!) {
                    createOffer(peerId: $peerId, sessionId: $sessionId) {
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: { peerId: this.peerId, sessionId: this.sessionId },
            transformResponse: ({ createOffer }) => createOffer.description
        });
    }

    async completeOffer(answer: RTCSessionDescriptionInit): Promise<void> {
        await this.adminClient.sendQuery<void>({
            query: gql`
                mutation CompletePeerRTCOffer(
                    $peerId: ID!,
                    $sessionId: ID!,
                    $answer: SessionDescriptionInput!
                ) {
                    completeOffer(peerId: $peerId, sessionId: $sessionId, answer: $answer)
                }
            `,
            variables: {
                peerId: this.peerId,
                sessionId: this.sessionId,
                answer: answer
            }
        });
    }

    answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        return this.adminClient.sendQuery<
            { answerOffer: SessionData },
            RTCSessionDescriptionInit
        >({
            query: gql`
                mutation GetPeerRTCAnswer(
                    $peerId: ID!,
                    $sessionId: ID!,
                    $offer: SessionDescriptionInput!
                ) {
                    answerOffer(peerId: $peerId, sessionId: $sessionId, offer: $offer) {
                        description {
                            type
                            sdp
                        }
                    }
                }
            `,
            variables: {
                peerId: this.peerId,
                sessionId: this.sessionId,
                offer
            },
            transformResponse: ({ answerOffer }) => answerOffer.description
        });
    }

}