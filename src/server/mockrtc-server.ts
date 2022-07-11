/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from "events";

import { MockRTC, MockRTCEvent, MockRTCOptions, MockRTCPeerBuilder } from "../mockrtc";
import { MockRTCServerPeer } from "./mockrtc-server-peer";
import { MockRTCHandlerBuilder } from "../handling/handler-builder";
import { HandlerStepDefinition } from "../handling/handler-step-definitions";
import { StepLookup } from "../handling/handler-steps";

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
        this.eventEmitter.removeAllListeners();
    }

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
        const peer = new MockRTCServerPeer(handlerSteps, this.options, this.eventEmitter);
        this._activePeers[peer.peerId] = peer;
        if (this.debug) console.log(
            `Built MockRTC peer ${peer.peerId} with steps: ${handlerStepDefinitions.map(d => d.type).join(', ')}`
        );
        return peer;
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

}