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
                rtcPeerConnected {
                    peerId
                    sessionId
                    localSdp { type, sdp }
                    remoteSdp { type, sdp }
                }
            }`,
            'peer-disconnected': gql`subscription OnPeerDisconnected {
                rtcPeerDisconnected {
                    peerId
                    sessionId
                }
            }`,
            'external-peer-attached': gql`subscription OnExternalPeerAttached {
                rtcExternalPeerAttached {
                    peerId
                    sessionId
                    externalConnection {
                        peerId
                        sessionId
                        localSdp { type, sdp }
                        remoteSdp { type, sdp }
                    }
                }
            }`
        }[event];

        if (!query) return; // Unrecognized event, we can't subscribe to this.

        return {
            query
        };
    }
}