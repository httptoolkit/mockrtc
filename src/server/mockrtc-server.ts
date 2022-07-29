/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from "events";

import { MockRTC, MockRTCEvent, MockRTCOptions, MockRTCPeerBuilder } from "../mockrtc";
import { MockRTCServerPeer } from "./mockrtc-server-peer";
import { MockRTCHandlerBuilder } from "../handling/handler-builder";
import { HandlerStepDefinition } from "../handling/handler-step-definitions";
import { DynamicProxyStep, StepLookup } from "../handling/handler-steps";
import { RTCConnection } from "../main";
import { MockRTCPeer } from "../mockrtc-peer";

const MATCHING_PEER_ID = 'matching-peer';

export class MockRTCServer implements MockRTC {

    private debug: boolean = false;

    constructor(
        private options: MockRTCOptions = {}
    ) {
        this.debug = !!options.debug;
    }

    private eventEmitter = new EventEmitter();

    async start(): Promise<void> {
        if (this.debug) console.log("Starting MockRTC mock session");

        this.matchingPeer = this._activePeers[MATCHING_PEER_ID] = new MockRTCServerPeer(
            this.matchConnection.bind(this),
            { ...this.options, peerId: MATCHING_PEER_ID },
            this.eventEmitter
        );
    }

    async stop(): Promise<void> {
        if (this.debug) console.log("Stopping MockRTC mock session");
        await this.reset();
    }

    async reset() {
        await Promise.all(
            this.activePeers.map(peer =>
                peer.close()
            )
        );

        this._activePeers = {};
        this.matchingPeer = undefined;

        this.eventEmitter.removeAllListeners();
    }

    private _activePeers: { [id: string]: MockRTCServerPeer } = {};
    get activePeers(): Readonly<MockRTCServerPeer[]> {
        return Object.values(this._activePeers);
    }

    getPeer(id: string): MockRTCServerPeer {
        return this._activePeers[id];
    }

    async on(event: MockRTCEvent, callback: (...args: any) => void) {
        this.eventEmitter.on(event, callback);
    }

    // Matching API:

    private matchingPeer: MockRTCServerPeer | undefined;

    getMatchingPeer(): MockRTCPeer {
        if (!this.matchingPeer) {
            throw new Error('Cannot get matching peer as the mock session is not started');
        }

        return this.matchingPeer;
    }

    private matchConnection(connection: RTCConnection) {
        return [
            new DynamicProxyStep()
        ];
    }

    // Peer definition API:

    buildPeer(): MockRTCPeerBuilder {
        return new MockRTCHandlerBuilder(this.buildPeerFromData);
    }

    buildPeerFromData = async (handlerStepDefinitions: HandlerStepDefinition[]): Promise<MockRTCServerPeer> => {
        const handlerSteps = handlerStepDefinitions.map((definition) => {
            return Object.assign(
                Object.create(StepLookup[definition.type].prototype),
                definition
            );
        });
        const peer = new MockRTCServerPeer(
            () => handlerSteps, // Always runs a fixed set of steps
            this.options,
            this.eventEmitter
        );
        this._activePeers[peer.peerId] = peer;
        if (this.debug) console.log(
            `Built MockRTC peer ${peer.peerId} with steps: ${handlerStepDefinitions.map(d => d.type).join(', ')}`
        );
        return peer;
    }

}