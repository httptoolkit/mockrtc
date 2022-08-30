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
        protected durationMs: number
    ) {
        super();
    }

}

export class WaitForChannelStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-channel';

    constructor(
        protected channelLabel?: string
    ) {
        super();
    }
}

export class WaitForMessageStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-message';

    constructor(
        protected channelLabel?: string
    ) {
        super();
    }

}

export class WaitForTrackStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-track';

}

export class WaitForMediaStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'wait-for-media';

}

export class CreateChannelStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'create-channel';

    constructor(
        protected channelLabel: string
    ) {
        super();
    }

}

export class SendStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'send-message';

    constructor(
        protected channelLabel: string | undefined,
        protected message: string | Buffer
    ) {
        super();
    }

}

export class CloseStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'close-connection';

}

export class EchoStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'echo-channels';

}

export class PeerProxyStepDefinition extends Serializable implements HandlerStepDefinition {

    readonly type = 'peer-proxy';

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

    readonly type = 'dynamic-proxy';

}

export const StepDefinitionLookup = {
    'wait-for-duration': WaitForDurationStepDefinition,
    'wait-for-channel': WaitForChannelStepDefinition,
    'wait-for-track': WaitForTrackStepDefinition,
    'wait-for-media': WaitForMediaStepDefinition,
    'wait-for-message': WaitForMessageStepDefinition,
    'create-channel': CreateChannelStepDefinition,
    'send-message': SendStepDefinition,
    'close-connection': CloseStepDefinition,
    'echo-channels': EchoStepDefinition,
    'peer-proxy': PeerProxyStepDefinition,
    'dynamic-proxy': DynamicProxyStepDefinition
};