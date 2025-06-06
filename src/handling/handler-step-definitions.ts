/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as PluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';

import { MockRTCSessionDescription } from '../mockrtc';
import type { RTCConnection } from '../webrtc/rtc-connection';

export type Serializable = PluggableAdmin.Serialization.Serializable;
export const { Serializable } = PluggableAdmin.Serialization;
type ClientServerChannel = PluggableAdmin.Serialization.ClientServerChannel;

export interface HandlerStepDefinition extends Serializable {
    readonly type: keyof typeof StepDefinitionLookup;
}

export class WaitForDurationStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-duration';
    static readonly isFinal = false;

    constructor(
        public readonly durationMs: number
    ) {
        super();
    }

    explain() {
        return `wait for ${this.durationMs}ms`;
    }

}

export class WaitForChannelStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-data-channel';
    static readonly isFinal = false;

    constructor(
        public readonly channelLabel?: string
    ) {
        super();
    }

    explain() {
        return `wait for an RTC channel${this.channelLabel ? ` labelled '${this.channelLabel}'` : ''}`;
    }

}

export class WaitForMessageStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-message';
    static readonly isFinal = false;

    constructor(
        public readonly channelLabel?: string
    ) {
        super();
    }

    explain() {
        return `wait for an RTC message${this.channelLabel ? ` on channel '${this.channelLabel}'` : ''}`;
    }

}

export class WaitForTrackStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-track';
    static readonly isFinal = false;

    explain() {
        return `wait for an RTC track`;
    }

}

export class WaitForMediaStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-media';
    static readonly isFinal = false;

    explain() {
        return `wait for RTC media data`;
    }

}

export class CreateChannelStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'create-rtc-data-channel';
    static readonly isFinal = false;

    constructor(
        public readonly channelLabel: string
    ) {
        super();
    }

    explain() {
        return `create an RTC data channel labelled '${this.channelLabel}'`;
    }

}

export class SendStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'send-rtc-data-message';
    static readonly isFinal = false;

    constructor(
        public readonly channelLabel: string | undefined,
        public readonly message: string | Buffer
    ) {
        super();
    }

    explain() {
        return `send an RTC data message${this.channelLabel ? ` on channel '${this.channelLabel}'` : ''}`;
    }

}

export class CloseStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'close-rtc-connection';
    static readonly isFinal = true;

    explain() {
        return `close the RTC connection`;
    }

}

export class EchoStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'echo-rtc';
    static readonly isFinal = true;

    explain() {
        return `echo all RTC media & data`;
    }

}

export class PeerProxyStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'rtc-peer-proxy';
    static readonly isFinal = true;

    protected externalConnections: RTCConnection[] = []; // Set here so it can be used in impl subclass

    protected getAnswer: (offer: MockRTCSessionDescription) => Promise<RTCSessionDescriptionInit>;

    constructor(
        connectionTarget:
            | RTCPeerConnection
            | ((offer: MockRTCSessionDescription) => Promise<RTCSessionDescriptionInit>)
    ) {
        super();
        if (connectionTarget instanceof Function) {
            this.getAnswer = connectionTarget;
        } else {
            this.getAnswer = async (offer: MockRTCSessionDescription) => {
                await connectionTarget.setRemoteDescription(offer);
                const answer = await connectionTarget.createAnswer();
                await connectionTarget.setLocalDescription(answer);
                return answer;
            };
        }
    }

    explain() {
        return `proxy the RTC connection to the configured peer`;
    }

    serialize(channel: ClientServerChannel): {} {
        channel.onRequest<
            { offer: MockRTCSessionDescription },
            { answer: RTCSessionDescriptionInit }
        >(async (msg) => {
            return { answer: await this.getAnswer(msg.offer) };
        });

        return { type: this.type };
    }

}

export class DynamicProxyStep extends Serializable implements HandlerStepDefinition {

    readonly type = 'rtc-dynamic-proxy';
    static readonly isFinal = true;

    protected externalConnections: RTCConnection[] = []; // Set here so it can be used in impl subclass

    explain() {
        return `proxy the RTC connection to a remote peer`;
    }

}

export const StepDefinitionLookup = {
    'wait-for-duration': WaitForDurationStep,
    'wait-for-rtc-data-channel': WaitForChannelStep,
    'wait-for-rtc-track': WaitForTrackStep,
    'wait-for-rtc-media': WaitForMediaStep,
    'wait-for-rtc-message': WaitForMessageStep,
    'create-rtc-data-channel': CreateChannelStep,
    'send-rtc-data-message': SendStep,
    'close-rtc-connection': CloseStep,
    'echo-rtc': EchoStep,
    'rtc-peer-proxy': PeerProxyStep,
    'rtc-dynamic-proxy': DynamicProxyStep
};