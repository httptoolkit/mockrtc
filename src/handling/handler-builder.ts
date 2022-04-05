/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    type HandlerStepDefinition,
    PeerProxyStepDefinition,
    SendStepDefinition,
    DynamicProxyStepDefinition,
    WaitForChannelStepDefinition,
    WaitForMessageStepDefinition,
    WaitForDurationStepDefinition,
    CloseStepDefinition,
    EchoStepDefinition,
    WaitForTrackStepDefinition
} from "./handler-step-definitions";

/**
 * The builder logic for composing RTC handling behaviour for both mock peers and rules,
 * by internally queuing defined actions until a `.thenX()` method is called to compile
 * the actions into either a peer or a rule (handled by an constructor callback param).
 */
export class MockRTCHandlerBuilder<R> {

    private handlerSteps: HandlerStepDefinition[] = [];

    constructor(
        private buildCallback: (handlerSteps: HandlerStepDefinition[]) => Promise<R>
    ) {}

    /**
     * Wait for a given duration, in milliseconds
     */
    sleep(duration: number): this {
        this.handlerSteps.push(new WaitForDurationStepDefinition(duration));
        return this;
    }

    /**
     * Wait until the remote client has opened at least one DataChannel.
     */
    waitForChannel(channelLabel?: string): this {
        this.handlerSteps.push(new WaitForChannelStepDefinition(channelLabel));
        return this;
    }

    /**
     * Wait until the remote client has opened at least one media track
     */
    waitForTrack(): this {
        this.handlerSteps.push(new WaitForTrackStepDefinition());
        return this;
    }

    /**
     * Wait until the remote client next sends a message to us on any DataChannel.
     *
     * This looks for new messages, ignoring any messages already consumed by
     * previous steps.
     */
    waitForMessage(): this {
        this.handlerSteps.push(new WaitForMessageStepDefinition());
        return this;
    }

    /**
     * Wait until the remote client sends a message to us on a specific DataChannel.
     *
     * This looks for new messages, ignoring any messages already consumed by
     * previous steps.
     */
    waitForMessageOnChannel(channelLabel: string): this {
        this.handlerSteps.push(new WaitForMessageStepDefinition(channelLabel));
        return this;
    }

    send(message: string | Buffer): this;
    send(channel: string | undefined, message: string | Buffer): this;
    send(...args: [string | undefined, string | Buffer] | [string | Buffer]): this {
        if (args[1] !== undefined) {
            const [channel, message] = args as [string, string | Buffer];
            this.handlerSteps.push(new SendStepDefinition(channel, message));
        } else {
            const [message] = args as [string | Buffer];
            this.handlerSteps.push(new SendStepDefinition(undefined, message));
        }
        return this;
    }

    thenSend(message: string | Buffer): Promise<R>;
    thenSend(channel: string, message: string | Buffer): Promise<R>;
    thenSend(...args: [string, string | Buffer] | [string | Buffer]): Promise<R> {
        return this.send(...args as [string | undefined, string | Buffer])
            .buildCallback(this.handlerSteps);
    }

    thenEcho(): Promise<R> {
        this.handlerSteps.push(new EchoStepDefinition());
        return this.buildCallback(this.handlerSteps);
    }

    thenClose(): Promise<R> {
        this.handlerSteps.push(new CloseStepDefinition());
        return this.buildCallback(this.handlerSteps);
    }

    thenForwardTo(peer: RTCPeerConnection): Promise<R> {
        this.handlerSteps.push(new PeerProxyStepDefinition(peer));
        return this.buildCallback(this.handlerSteps);
    }

    thenForwardDynamically(): Promise<R> {
        this.handlerSteps.push(new DynamicProxyStepDefinition());
        return this.buildCallback(this.handlerSteps);
    }

}
