/*
 * SPDX-FileCopyrightText: 2022 Tim Perry <tim@httptoolkit.tech>
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as NodeDataChannel from 'node-datachannel';

import { MockRTCControlMessage, MOCKRTC_CONTROL_CHANNEL } from './control-channel';

import { DataChannelStream } from './datachannel-stream';
import { MediaTrackStream } from './mediatrack-stream';
import { RTCConnection } from './rtc-connection';

export class MockRTCConnection extends RTCConnection {

    // If the client supports a MockRTC control channge to send extra metadata during mocking,
    // they will create this at startup, and we'll track it here, separately from all other channels.
    private controlChannel: DataChannelStream | undefined;
    private externalConnection: RTCConnection | undefined;

    constructor(
        private getExternalConnection: (id: string) => RTCConnection
    ) {
        super();
    }

    protected trackNewChannel(channel: NodeDataChannel.DataChannel, options: { isLocal: boolean }) {
        if (channel.getLabel() === MOCKRTC_CONTROL_CHANNEL && !options.isLocal) {
            // We don't track the control channel like other channels - we handle it specially.
            if (this.controlChannel) {
                const error = new Error('Cannot open multiple control channels simultaneously');
                channel.sendMessage(JSON.stringify({
                    type: 'error',
                    error: error.message
                }));
                setTimeout(() => channel.close(), 100);
                throw error;
            }

            this.controlChannel = new DataChannelStream(channel);

            this.controlChannel.on('data', (msg) => {
                try {
                    const controlMessage = JSON.parse(msg) as MockRTCControlMessage;

                    if (controlMessage.type === 'attach-external') {
                        if (this.externalConnection) {
                            throw new Error('Cannot attach mock connection to multiple external connections');
                        }

                        const externalConnection = this.getExternalConnection(controlMessage.id);
                        // We don't attach until the external connection actually connects. Typically that's
                        // already happened at this point, but its not guaranteed, so best to check:
                        externalConnection.waitUntilConnected().then(() => {
                            this.externalConnection = externalConnection;
                            this.emit('external-connection-attached', this.externalConnection);
                        });

                        // We don't necessarily proxy traffic through to the external connection at this
                        // point, that depends on the specific handling that's used here.
                    } else {
                        throw new Error(`Unrecognized control channel message: ${controlMessage.type}`);
                    }
                } catch (e: any) {
                    console.warn("Failed to handle control channel message", e);
                    this.controlChannel?.write(JSON.stringify({
                        type: 'error',
                        error: e.message || e
                    }));
                }
            });

            this.controlChannel.on('close', () => {
                this.controlChannel = undefined;
            });

            this.controlChannel.on('error', (error) => {
                console.error('Control channel error:', error);
            });

            return this.controlChannel!;
        } else {
            return super.trackNewChannel(channel, options);
        }
    }

    async proxyTrafficToExternalConnection() {
        if (!this.externalConnection) {
            await new Promise((resolve) => this.once('external-connection-attached', resolve));
        }

        await this.proxyTrafficTo(this.externalConnection!);
    }

    async proxyTrafficTo(externalConnection: RTCConnection) {
        if (this.externalConnection) {
            if (externalConnection !== this.externalConnection) {
                throw new Error('Cannot attach multiple external connections');
            }
        } else {
            await externalConnection.waitUntilConnected();
            this.externalConnection = externalConnection;
            this.emit('external-connection-attached', this.externalConnection);
        }

        /**
         * When proxying traffic, you effectively have four peers, each with a connection endpoint:
         * - The incoming RTCPeerConnection that we're mocking ('internal')
         * - This MockRTC connection, with an associated MockRTCPeer that it will actually connect to ('mock')
         * - A MockRTC external connection that will connect to the remote peer ('external')
         * - The original remote peer that we're connecting to ('remote')
         *
         * Once the proxy is set up, the the connection structure works like so:
         * INTERNAL <--> MOCK <--> EXTERNAL <--> REMOTE
         *
         * Here we connect the internal & external connections together, proxying all behaviours between the
         * two so that from this point forwards every event on one is reflected on the other.
         *
         * Note that this isn't necessarily the initialization of either connection: the remote peer could
         * have been connected for a while (sending data with no response), and the internal peer could have
         * been fully interacting with steps before this point.
         */


        // Mirror connection closure:
        this.on('connection-closed', () => externalConnection.close());
        externalConnection.on('connection-closed', () => this.close());

        /// --- Data channels: --- ///

        // Forward *all* existing internal channels to the external connection:
        this.channels.forEach((channel: DataChannelStream) => { // All channels, in case a previous step created one
            const mirrorChannelStream = externalConnection.createDataChannel(channel.label);
            channel.pipe(mirrorChannelStream).pipe(channel);
        });

        // Forward any existing external channels back to this peer connection. Note that we're mirroring
        // *remote* channels only, so we skip the channels that we've just created above.
        externalConnection.remoteChannels.forEach((channel: DataChannelStream) => {
            const mirrorChannelStream = this.createDataChannel(channel.label);
            channel.pipe(mirrorChannelStream).pipe(channel);
        });

        // If any new channels open in future, mirror them to the other peer:
        [[this, externalConnection], [externalConnection, this]].forEach(([connA, connB]) => {
            connA.on('remote-channel-created', (incomingChannel: DataChannelStream) => {
                const mirrorChannelStream = connB.createDataChannel(incomingChannel.label);
                incomingChannel.pipe(mirrorChannelStream).pipe(incomingChannel);
            });
        });

        /// --- Media tracks: --- ///

        // Note that while data channels will *not* have been negotiated before this point, so
        // we can always assume that mock data channels need mirroring, media tracks are negotiated
        // in the SDP, not in-band, and so any media track could already exist on the other side.

        // For each track on the internal connection, proxy it to the corresponding external track:
        this.mediaTracks.forEach((track: MediaTrackStream) => {
            const externalStream = externalConnection.mediaTracks.find(({ mid }) => mid === track.mid);
            if (externalStream) {
                if (externalStream.type === track.type) {
                    track.pipe(externalStream).pipe(track);
                } else {
                    throw new Error(`Mock & external streams with mid ${track.mid} have mismatched types (${
                        track.type
                    }/${
                        externalStream.type
                    })`);
                }
            } else {
                // A mismatch in media streams means the external & mock peer negotiation isn't in sync!
                // For now we just reject this case - later we should try to prompt a renegotiation.
                throw new Error(`Mock has ${track.type} ${track.mid} but external does not`);
            }
        });
    }

}