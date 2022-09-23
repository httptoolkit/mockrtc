/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import * as PluggableAdmin from 'mockttp/dist/pluggable-admin-api/pluggable-admin.browser';

import { MockRTCSessionDescription } from '../mockrtc';

export type Serializable = PluggableAdmin.Serialization.Serializable;
export const { Serializable } = PluggableAdmin.Serialization;
type ClientServerChannel = PluggableAdmin.Serialization.ClientServerChannel;

export interface HandlerStepDefinition extends Serializable {
    readonly type: keyof typeof StepDefinitionLookup;
}

export class WaitForDurationStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-duration';

    constructor(
        public readonly durationMs: number
    ) {
        super();
    }

    explain() {
        return `wait for ${this.durationMs}ms`;
    }

}

export class WaitForChannelStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-data-channel';

    constructor(
        public readonly channelLabel?: string
    ) {
        super();
    }

    explain() {
        return `wait for an RTC channel${this.channelLabel ? ` labelled '${this.channelLabel}'` : ''}`;
    }

}

export class WaitForMessageStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-message';

    constructor(
        public readonly channelLabel?: string
    ) {
        super();
    }

    explain() {
        return `wait for an RTC message${this.channelLabel ? ` on channel '${this.channelLabel}'` : ''}`;
    }

}

export class WaitForTrackStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-track';

    explain() {
        return `wait for an RTC track`;
    }

}

export class WaitForMediaStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-rtc-media';

    explain() {
        return `wait for RTC media data`;
    }

}

export class CreateChannelStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'create-rtc-data-channel';

    constructor(
        public readonly channelLabel: string
    ) {
        super();
    }

    explain() {
        return `create an RTC data channel labelled '${this.channelLabel}'`;
    }

}

export class SendStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'send-rtc-data-message';

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

export class CloseStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'close-rtc-connection';

    explain() {
        return `close the RTC connection`;
    }

}

export class EchoStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'echo-rtc';

    explain() {
        return `echo all RTC media & data`;
    }

}

export class PeerProxyStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'rtc-peer-proxy';

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

export class DynamicProxyStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'rtc-dynamic-proxy';

    explain() {
        return `proxy the RTC connection to a remote peer`;
    }

}

export const StepDefinitionLookup = {
    'wait-for-duration': WaitForDurationStepDefinition,
    'wait-for-rtc-data-channel': WaitForChannelStepDefinition,
    'wait-for-rtc-track': WaitForTrackStepDefinition,
    'wait-for-rtc-media': WaitForMediaStepDefinition,
    'wait-for-rtc-message': WaitForMessageStepDefinition,
    'create-rtc-data-channel': CreateChannelStepDefinition,
    'send-rtc-data-message': SendStepDefinition,
    'close-rtc-connection': CloseStepDefinition,
    'echo-rtc': EchoStepDefinition,
    'rtc-peer-proxy': PeerProxyStepDefinition,
    'rtc-dynamic-proxy': DynamicProxyStepDefinition
};