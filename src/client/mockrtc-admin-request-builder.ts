/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import gql from 'graphql-tag';
import * as stream from 'stream';

// Long-term, it'd be great to use the 'official' export path of mockttp/pluggable-admin, but
// if we do so, then TypeScript <4.7 doesn't understand it here or downstream, so we get errors.
// We don't want to use the main-exported version to avoid bundling all of Mockttp in browsers.
// For now we have to use the direct import. We can update once TS 4.7 is widely used.
import * as BrowserPluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';
import { AdminQuery } from 'mockttp/dist/client/admin-query';

import { HandlerStepDefinition } from '../handling/handler-step-definitions';
import { MockRTCEvent, MockRTCEventData } from '../mockrtc';

/**
 * This is part of Mockttp's experimental 'pluggable admin' API. This may change
 * unpredictably, even in minor releases.
 *
 * @internal
 */
export class MockRTCAdminRequestBuilder {

    buildCreatePeerQuery(
        handlerSteps: Array<HandlerStepDefinition>,
        adminStream: stream.Duplex
    ): AdminQuery<
        { createPeer: { peerId: string } },
        { peerId: string }
    > {
        return {
            query: gql`
                mutation CreatePeer($peerData: RTCHandlerData!) {
                    createPeer(data: $peerData) {
                        peerId
                    }
                }
            `,
            variables: {
                peerData: {
                    steps: handlerSteps.map(step =>
                        BrowserPluggableAdmin.Serialization.serialize(step, adminStream)
                    )
                }
            },
            transformResponse: ({ createPeer }) => createPeer
        };
    }

    buildSubscriptionRequest<E extends MockRTCEvent>(event: E): AdminQuery<MockRTCEventData[E]> | undefined {
        const query = {
            'peer-connected': gql`subscription OnPeerConnected {
                peerConnected {
                    peerId
                    sessionId
                    localSdp { type, sdp }
                    remoteSdp { type, sdp }
                }
            }`,
            'peer-disconnected': gql`subscription OnPeerDisconnected {
                peerDisconnected {
                    peerId
                    sessionId
                }
            }`,
            'external-peer-attached': gql`subscription OnExternalPeerAttached {
                externalPeerAttached {
                    peerId
                    sessionId
                    externalConnection {
                        sessionId
                        localSdp { type, sdp }
                        remoteSdp { type, sdp }
                    }
                }
            }`,
            'data-channel-opened': gql`subscription OnDataChannelOpen {
                dataChannelOpened {
                    peerId
                    sessionId
                    channelId
                    channelLabel
                }
            }`,
            'data-channel-message-sent': gql`subscription OnDataChannelMessageSent {
                dataChannelMessageSent {
                    peerId
                    sessionId
                    channelId
                    direction
                    content
                    isBinary
                }
            }`,
            'data-channel-message-received': gql`subscription OnDataChannelMessageReceived {
                dataChannelMessageReceived {
                    peerId
                    sessionId
                    channelId
                    direction
                    content
                    isBinary
                }
            }`,
            'data-channel-closed': gql`subscription OnDataChannelClose {
                dataChannelClosed {
                    peerId
                    sessionId
                    channelId
                }
            }`,
            'media-track-opened': gql`subscription OnDataChannelClose {
                mediaTrackOpened {
                    peerId
                    sessionId
                    trackMid
                    trackType
                    trackDirection
                }
            }`,
            'media-track-stats': gql`subscription OnDataChannelClose {
                mediaTrackStats {
                    peerId
                    sessionId
                    trackMid
                    totalBytesSent
                    totalBytesReceived
                }
            }`,
            'media-track-closed': gql`subscription OnDataChannelClose {
                mediaTrackClosed {
                    peerId
                    sessionId
                    trackMid
                }
            }`
        }[event];

        if (!query) return; // Unrecognized event, we can't subscribe to this.

        return {
            query,
            transformResponse: (result: any) => {
                if (result.content) result.content = Buffer.from(result.content, 'base64');
                return result;
            }
        };
    }
}