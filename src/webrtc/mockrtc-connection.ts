import * as NodeDataChannel from 'node-datachannel';

import { MockRTCControLMessage, MOCKRTC_CONTROL_CHANNEL } from '../control-channel';

import { DataChannelStream } from './datachannel-stream';
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
                    const controlMessage = JSON.parse(msg) as MockRTCControLMessage;

                    if (controlMessage.type === 'attach-external') {
                        if (this.externalConnection) {
                            throw new Error('Cannot attach mock connection to multiple external connections');
                        }
                        this.externalConnection = this.getExternalConnection(controlMessage.id);

                        this.emit('external-connection-attached');

                        // We don't necessarily proxy traffic through to the external connection at this point,
                        // that depends on the specific handling that's used here.
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

        this.proxyTrafficTo(this.externalConnection!);
    }

    proxyTrafficTo(externalConnection: RTCConnection) {
        // When proxying traffic, you effectively have two connections between four peers: a remote mocked peer,
        // a local mocking peer (connected by this connection), a local external peer and a remote external peer
        // (connected by externalConnection). This code forwards between the local mocking peer & local external peer.

        // Forward any existing mocked channels to the external connection:
        this.channels.forEach((channel: DataChannelStream) => { // All channels, in case a previous step created one
            const mirrorChannelStream = externalConnection.createDataChannel(channel.label);
            channel.pipe(mirrorChannelStream).pipe(channel);
        });

        // If our mocked peer opens new channels, forward them to the extenal connection:
        this.addListener('remote-channel-open', (channel: DataChannelStream) => {
            const mirrorChannelStream = externalConnection.createDataChannel(channel.label);
            channel.pipe(mirrorChannelStream).pipe(channel);
        });

        // Forward any existing external channels back to this peer connection. Note that we're mirroring
        // *remote* channels only, so we skip the channels that we've just created above.
        externalConnection.remoteChannels.forEach((channel: DataChannelStream) => {
            const mirrorChannelStream = this.createDataChannel(channel.label);
            channel.pipe(mirrorChannelStream).pipe(channel);
        });

        // If their remote external peer opens incoming connections, open them on this connection too:
        externalConnection.on('remote-channel-open', (incomingChannel: DataChannelStream) => {
            const mirrorChannelStream = this.createDataChannel(incomingChannel.label);
            incomingChannel.pipe(mirrorChannelStream).pipe(incomingChannel);
        });

        this.on('connection-closed', () => externalConnection.close());
        externalConnection.on('connection-closed', () => this.close());
    }

}