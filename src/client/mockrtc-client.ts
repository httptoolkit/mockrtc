/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */


// Long-term, it'd be great to use the 'official' export path of mockttp/pluggable-admin, but
// if we do so, then TypeScript <4.7 doesn't understand it here or downstream, so we get errors.
// We don't want to use the main-exported version to avoid bundling all of Mockttp in browsers.
// For now we have to use the direct import. We can update once TS 4.7 is widely used.
import * as BrowserPluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';
import type { PluggableAdmin } from 'mockttp';

import { MockRTC, MockRTCEvent, MockRTCOptions, MockRTCPeerBuilder } from "../mockrtc";

import type { MockRTCAdminPlugin } from "../server/mockrtc-admin-plugin";
import type { MockRTCPeer } from '../mockrtc-peer';
import { MockRTCRemotePeer } from './mockrtc-remote-peer';
import { MockRTCHandlerBuilder } from '../handling/handler-builder';
import { HandlerStepDefinition } from '../handling/handler-step-definitions';
import { MockRTCAdminRequestBuilder } from './mockrtc-admin-request-builder';

export type MockRTCClientOptions =
    PluggableAdmin.AdminClientOptions &
    MockRTCOptions;

export class MockRTCClient implements MockRTC {

    private adminClient: PluggableAdmin.AdminClient<{ webrtc: MockRTCAdminPlugin }>;
    private requestBuilder: MockRTCAdminRequestBuilder;

    constructor(
        private options: MockRTCClientOptions = {}
    ) {
        this.adminClient = new BrowserPluggableAdmin.AdminClient(options);
        this.requestBuilder = new MockRTCAdminRequestBuilder();
    }

    getMatchingPeer(): MockRTCPeer {
        return new MockRTCRemotePeer('matching-peer', this.adminClient);
    }

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    private buildPeerFromData = async (handlerSteps: HandlerStepDefinition[]): Promise<MockRTCPeer> => {
        const { adminStream } = this.adminClient;

        const peerData = await this.adminClient.sendQuery(
            this.requestBuilder.buildCreatePeerQuery(handlerSteps, adminStream)
        );

        const { peerId } = peerData;

        return new MockRTCRemotePeer(peerId, this.adminClient);
    }

    async start(): Promise<void> {
        await this.adminClient.start({
            webrtc: this.options
        });
    }

    async stop(): Promise<void> {
        await this.adminClient.stop();
    }

    async on(event: MockRTCEvent, callback: any): Promise<void> {
        const subscriptionRequest = this.requestBuilder.buildSubscriptionRequest(event);

        if (!subscriptionRequest) {
            // We just return an immediately promise if we don't recognize the event, which will quietly
            // succeed but never call the corresponding callback (the same as the server and most event
            // sources in the same kind of situation). This is what happens when the *client* doesn't
            // recognize the event. Subscribe() below handles the unknown-to-server case.
            console.warn(`Ignoring subscription for event unrecognized by MockRTC client: ${event}`);
            return;
        }

        return this.adminClient.subscribe(subscriptionRequest, callback);
    }
}