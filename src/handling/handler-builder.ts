/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    type HandlerStepDefinition,
    PeerProxyStepDefinition,
    CreateChannelStepDefinition,
    SendStepDefinition,
    DynamicProxyStepDefinition,
    WaitForChannelStepDefinition,
    WaitForMessageStepDefinition,
    WaitForDurationStepDefinition,
    CloseStepDefinition,
    EchoStepDefinition,
    WaitForTrackStepDefinition,
    WaitForMediaStepDefinition
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
     *
     * @category Steps
     */
    sleep(duration: number): MockRTCHandlerBuilder<R> {
        this.handlerSteps.push(new WaitForDurationStepDefinition(duration));
        return this;
    }

    /**
     * Wait until the remote client has created at least one DataChannel.
     *
     * @category Steps
     */
    waitForChannel(channelLabel?: string): MockRTCHandlerBuilder<R> {
        this.handlerSteps.push(new WaitForChannelStepDefinition(channelLabel));
        return this;
    }

    /**
     * Wait until the remote client has created at least one media track
     *
     * @category Steps
     */
    waitForTrack(): MockRTCHandlerBuilder<R> {
        this.handlerSteps.push(new WaitForTrackStepDefinition());
        return this;
    }

    /**
     * Wait until the remote client next sends a message to us on any DataChannel.
     *
     * This looks for new messages, ignoring any messages already consumed by
     * previous steps.
     *
     * @category Steps
     */
    waitForNextMessage(): MockRTCHandlerBuilder<R> {
        this.handlerSteps.push(new WaitForMessageStepDefinition());
        return this;
    }

    /**
     * Wait until the remote client next sends media data on a media track.
     *
     * This waits for new media, ignoring any media already consumed by previous steps.
     *
     * @category Steps
     */
    waitForNextMedia(): MockRTCHandlerBuilder<R> {
        this.handlerSteps.push(new WaitForMediaStepDefinition());
        return this;
    }

    /**
     * Wait until the remote client sends a message to us on a specific DataChannel.
     *
     * This looks for new messages, ignoring any messages already consumed by
     * previous steps.
     *
     * @category Steps
     */
    waitForNextMessageOnChannel(channelLabel: string): MockRTCHandlerBuilder<R> {
        this.handlerSteps.push(new WaitForMessageStepDefinition(channelLabel));
        return this;
    }

    /**
     * Creates a new data channel with the given name, waiting until it opens
     * before continuing.
     *
     * @category Steps
     */
    createDataChannel(channelLabel: string): MockRTCHandlerBuilder<R> {
        this.handlerSteps.push(new CreateChannelStepDefinition(channelLabel));
        return this;
    }

    /**
     * Send a message or buffer on the connection's data channels.
     *
     * This can take one or two arguments. If only one is provided, it is used
     * as a message that's sent on all open data channels. If two arguments are
     * provided, the first must be the data channel label, and the message (the
     * second) will be sent only to data channel(s) with that label.
     *
     * If no matching channels are open, this is a no-op. Use `waitForChannel()`
     * to ensure the channels you're expecting are open first if necessary.
     *
    * @category Steps
     */
    send(message: string | Buffer): MockRTCHandlerBuilder<R>;
    send(channel: string | undefined, message: string | Buffer): MockRTCHandlerBuilder<R>;
    send(...args: [string | undefined, string | Buffer] | [string | Buffer]): MockRTCHandlerBuilder<R> {
        if (args[1] !== undefined) {
            const [channel, message] = args as [string, string | Buffer];
            this.handlerSteps.push(new SendStepDefinition(channel, message));
        } else {
            const [message] = args as [string | Buffer];
            this.handlerSteps.push(new SendStepDefinition(undefined, message));
        }
        return this;
    }

    /**
     * Immediately close the connection.
     *
     * This defines a final step, and will then create a mock peer from the full
     * set of steps you've defined, and return it wrapped in a promise. As soon
     * as the promise resolves the peer is ready to use.
     *
     * @category Final Steps
     */
    thenClose(): Promise<R> {
        this.handlerSteps.push(new CloseStepDefinition());
        return this.buildCallback(this.handlerSteps);
    }

    /**
     * Send a message or buffer on the connection's data channels, then close the
     * connection. This is equivalent to {@link send `.send()`} then
     * {@link thenClose `.thenClose()`}.
     *
     * This defines a final step, and will then create a mock peer from the full
     * set of steps you've defined, and return it wrapped in a promise. As soon
     * as the promise resolves the peer is ready to use.
     *
     * @category Final Steps
     */
    thenSend(message: string | Buffer): Promise<R>;
    thenSend(channel: string, message: string | Buffer): Promise<R>;
    thenSend(...args: [string, string | Buffer] | [string | Buffer]): Promise<R> {
        return this.send(...args as [string | undefined, string | Buffer])
            .buildCallback(this.handlerSteps);
    }

    /**
     * Echo all incoming data channel messages until the other peer closes the
     * connection.
     *
     * This defines a final step, and will then create a mock peer from the full
     * set of steps you've defined, and return it wrapped in a promise. As soon
     * as the promise resolves the peer is ready to use.
     *
     * @category Final Steps
     */
    thenEcho(): Promise<R> {
        this.handlerSteps.push(new EchoStepDefinition());
        return this.buildCallback(this.handlerSteps);
    }

    /**
     * Creates a new external connection to the given remote peer connection,
     * matching the existing mocked connection, and then proxies all traffic
     * through to that peer.
     *
     * This defines a final step, and will then create a mock peer from the full
     * set of steps you've defined, and return it wrapped in a promise. As soon
     * as the promise resolves the peer is ready to use.
     *
     * @category Final Steps
     */
    thenForwardTo(peer: RTCPeerConnection): Promise<R> {
        this.handlerSteps.push(new PeerProxyStepDefinition(peer));
        return this.buildCallback(this.handlerSteps);
    }

    /**
     * Proxy this connection dynamically to the 'real' target peer, whoever
     * that may be.
     *
     * This assumes that you have an existing external connection already
     * set up and attached to this mock connection.
     *
     * You can do that either by using {@link hookWebRTCConnection} or
     * {@link hookAllWebRTC} to hook your connection during normal setup to
     * automatically create an external offer to the real remote peer, or you can
     * do so manually using {@link MockRTCPeer.createExternalOffer} or
     * {@link MockRTCPeer.answerExternalOffer} and then passing the connection
     * id as {@link https://github.com/httptoolkit/mockrtc/blob/d0604f3111e0438c52aa514d00cf04ac0718dfeb/src/webrtc-hooks.ts#L83-L93 here}.
     *
     * This defines a final step, and will then create a mock peer from the full
     * set of steps you've defined, and return it wrapped in a promise. As soon
     * as the promise resolves the peer is ready to use.
     *
     * @category Final Steps
     */
    thenPassThrough(): Promise<R> {
        this.handlerSteps.push(new DynamicProxyStepDefinition());
        return this.buildCallback(this.handlerSteps);
    }

}
