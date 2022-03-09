import { gql } from 'graphql-tag';
import { PluggableAdmin } from 'mockttp';

import type { MockRTCPeer } from "./mockrtc-peer";

export class MockRTCRemotePeer implements MockRTCPeer {

    constructor(
        readonly id: string,
        private adminClient: PluggableAdmin.AdminClient<{}>
    ) {}

    async answerOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
        return this.adminClient.sendQuery<
            { answerOffer: RTCSessionDescriptionInit },
            RTCSessionDescriptionInit
        >({
            query: gql`
                mutation GetPeerRTCAnswer($id: ID!, $offer: SessionDescriptionInput!) {
                    answerOffer(peerId: $id, offer: $offer) {
                        type
                        sdp
                    }
                }
            `,
            variables: { id: this.id, offer },
            transformResponse: ({ answerOffer }) => answerOffer
        });
    }

    getAllMessages() {
        return this.adminClient.sendQuery<
            { getSeenMessages: Array<string | { type: 'buffer', value: string }> },
            Array<string | Buffer>
        >({
            query: gql`
                query GetPeerSeenMessages($id: ID!) {
                    getSeenMessages(peerId: $id)
                }
            `,
            variables: { id: this.id },
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
                query GetPeerSeenMessages($id: ID!, $channelName: String) {
                    getSeenMessages(peerId: $id, channelName: $channelName)
                }
            `,
            variables: { id: this.id, channelName },
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