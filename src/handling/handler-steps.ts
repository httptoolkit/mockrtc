/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import { PluggableAdmin } from 'mockttp';

import { MockRTCSessionDescription } from '../mockrtc';
import type { DataChannelStream } from '../webrtc/datachannel-stream';
import type { MediaTrackStream } from '../webrtc/mediatrack-stream';
import type { MockRTCConnection } from '../webrtc/mockrtc-connection';
import { RTCConnection } from '../webrtc/rtc-connection';
import {
    StepDefinitionLookup,
    CloseStepDefinition,
    DynamicProxyStepDefinition,
    EchoStepDefinition,
    HandlerStepDefinition,
    PeerProxyStepDefinition,
    CreateChannelStepDefinition,
    SendStepDefinition,
    WaitForChannelStepDefinition,
    WaitForDurationStepDefinition,
    WaitForMediaStepDefinition,
    WaitForMessageStepDefinition,
    WaitForTrackStepDefinition
} from './handler-step-definitions';

type ClientServerChannel = PluggableAdmin.Serialization.ClientServerChannel;

export interface HandlerStep extends HandlerStepDefinition {
    handle(connection: MockRTCConnection): Promise<void>;
}

export class WaitForDurationStep extends WaitForDurationStepDefinition {

    async handle(): Promise<void> {
        return new Promise<void>((resolve) => setTimeout(resolve, this.durationMs));
    }

}

export class WaitForChannelStep extends WaitForChannelStepDefinition {

    private matchesChannel(channel: DataChannelStream) {
        return this.channelLabel === undefined || this.channelLabel === channel.label;
    }

    async handle(connection: MockRTCConnection): Promise<void> {
        return new Promise<void>((resolve) => {
            const channelOpened = (channel: DataChannelStream) => {
                if (this.matchesChannel(channel)) {
                    connection.removeListener('remote-channel-open', channelOpened);
                    resolve();
                }
            };

            connection.on('remote-channel-open', channelOpened);
            connection.remoteChannels.forEach(channelOpened);
        });
    }

}

export class WaitForMessageStep extends WaitForMessageStepDefinition {

    private matchesChannel(channel: DataChannelStream) {
        return this.channelLabel === undefined || this.channelLabel === channel.label;
    }

    async handle(connection: MockRTCConnection): Promise<void> {
        return new Promise<void>((resolve) => {
            const messageReceived = () => {
                connection.removeListener('channel-created', listenForMessage);
                connection.channels.forEach((channel) => {
                    channel.removeListener('data', messageReceived);
                    channel.pause();
                });

                resolve();
            };

            const listenForMessage = (channel: DataChannelStream) => {
                if (this.matchesChannel(channel)) {
                    channel.once('data', messageReceived);
                }
            }

            connection.on('channel-created', listenForMessage);
            connection.channels.forEach(listenForMessage);
        });
    }

}

export class WaitForTrackStep extends WaitForTrackStepDefinition {

    async handle(connection: MockRTCConnection): Promise<void> {
        await new Promise<void>((resolve) => {
            if (connection.remoteMediaTracks.length) resolve();
            else connection.once('remote-track-open', () => resolve());
        });
    }

}

export class WaitForMediaStep extends WaitForMediaStepDefinition {

    async handle(connection: MockRTCConnection): Promise<void> {
        return new Promise<void>((resolve) => {
            const messageReceived = () => {
                connection.removeListener('track-created', listenForData);
                connection.mediaTracks.forEach((track) => {
                    track.removeListener('data', messageReceived);
                    track.pause();
                });

                resolve();
            };

            const listenForData = (track: MediaTrackStream) => {
                track.once('data', messageReceived);
            }

            connection.on('track-created', listenForData);
            connection.mediaTracks.forEach(listenForData);
        });
    }

}

export class CreateChannelStep extends CreateChannelStepDefinition {

    async handle(conn: MockRTCConnection): Promise<void> {
        const channel = conn.createDataChannel(this.channelLabel);
        return new Promise<void>((resolve) =>
            channel.once('channel-open', resolve)
        );
    }

}

export class SendStep extends SendStepDefinition {

    private matchesChannel(channel: DataChannelStream) {
        return this.channelLabel === undefined || this.channelLabel === channel.label;
    }

    async handle({ channels }: MockRTCConnection): Promise<void> {
        await Promise.all(
            channels
            .filter((channel) => this.matchesChannel(channel))
            .map((channel) => {
                return new Promise<void>((resolve, reject) => {
                    channel.write(this.message, (error: Error | null | undefined) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
            })
        );
    }

    static deserialize(data: {
        channelLabel: string | undefined,
        message: string | { type: 'Buffer', data: number[] }
    }): SendStep {
        return new SendStep(
            data.channelLabel,
            typeof data.message === 'string'
                ? data.message
                // Buffers are serialized very roughly, so here we
                // turn them back into real Buffer instances:
                : Buffer.from(data.message.data)
        );
    }

}

export class CloseStep extends CloseStepDefinition {

    async handle(connection: MockRTCConnection): Promise<void> {
        await connection.close();
    }

}

export class EchoStep extends EchoStepDefinition {

    async handle(connection: MockRTCConnection): Promise<void> {
        const echoContent = (stream: DataChannelStream | MediaTrackStream) => {
            stream.pipe(stream);
        };

        connection.on('channel-created', echoContent);
        connection.on('track-created', echoContent);
        connection.channels.forEach(echoContent);
        connection.mediaTracks.forEach(echoContent);

        // This step keeps running indefinitely, until the connection closes
        return new Promise<void>((resolve) => connection.on('connection-closed', resolve));
    }

}

export class PeerProxyStep extends PeerProxyStepDefinition {

    private externalConnections: RTCConnection[] = [];

    async handle(connection: MockRTCConnection) {
        const externalConn = new RTCConnection();
        this.externalConnections.push(externalConn);

        // We mirror the internal peer's SDP as an offer to the given connection:
        const externalOffer = await externalConn.getMirroredLocalOffer(
            connection.getRemoteDescription()!.sdp!
        );
        externalConn.setRemoteDescription(await this.getAnswer(externalOffer));

        await connection.proxyTrafficTo(externalConn);

        // This step keeps running indefinitely, until the connection closes
        return new Promise<void>((resolve) => connection.on('connection-closed', resolve));
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

    static deserialize(_data: {}, channel: ClientServerChannel): PeerProxyStep {
        return new PeerProxyStep(async (offer: MockRTCSessionDescription) => {
            const response = await channel.request<
                { offer: MockRTCSessionDescription },
                { answer: MockRTCSessionDescription }
            >({ offer });
            return response.answer;
        });
    }

    dispose(): void {
        this.externalConnections.forEach(conn => conn.close());
    }

}

export class DynamicProxyStep extends DynamicProxyStepDefinition {

    private externalConnections: RTCConnection[] = [];

    async handle(connection: MockRTCConnection) {
        await connection.proxyTrafficToExternalConnection();

        // This step keeps running indefinitely, until the connection closes
        return new Promise<void>((resolve) => connection.on('connection-closed', resolve));
    }

    dispose(): void {
        this.externalConnections.forEach(conn => conn.close());
    }

}

export const StepLookup: typeof StepDefinitionLookup = {
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