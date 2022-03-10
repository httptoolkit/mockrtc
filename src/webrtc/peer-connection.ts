import { EventEmitter } from 'events';
import * as NodeDataChannel from 'node-datachannel';

import { DataChannelStream } from './datachannel-stream';

export class MockRTCPeerConnection extends EventEmitter {

    private rawConn = new NodeDataChannel.PeerConnection("MockRTCPeer", { iceServers: [] });

    public readonly channels: Array<DataChannelStream> = [];

    constructor() {
        super();

        this.rawConn.onDataChannel((channel) => {
            this.trackNewChannel(channel, { isLocal: false });
        });

        this.rawConn.onStateChange((state) => {
            if (state === 'closed') this.emit('connection-closed');
        });
    }

    createDataChannel(label: string) {
        const channel = this.rawConn.createDataChannel(label);
        return this.trackNewChannel(channel, { isLocal: true });
    }

    private trackNewChannel(channel: NodeDataChannel.DataChannel, options: { isLocal: boolean }) {
        const channelStream = new DataChannelStream(channel);
        this.channels.push(channelStream);

        channelStream.on('close', () => {
            const channelIndex = this.channels.findIndex(c => c === channelStream);
            if (channelIndex !== -1) {
                this.channels.splice(channelIndex, 1);
            }
        });

        channelStream.on('error', (error) => {
            console.error('Channel error:', error);
        });

        this.emit('channel-open', channelStream);
        if (options.isLocal) {
            this.emit('local-channel-open', channelStream);
        } else {
            this.emit('remote-channel-open', channelStream);
        }

        return channelStream;
    }

    setRemoteDescription(description: RTCSessionDescriptionInit) {
        const { type: offerType, sdp: offerSdp } = description;
        if (!offerSdp) throw new Error("Cannot set MockRTC peer description without providing an SDP");
        this.rawConn.setRemoteDescription(offerSdp, offerType[0].toUpperCase() + offerType.slice(1) as any);
    }

    /**
     * Gets the local description for this connection, waiting until gathering is complete to provide a
     * full result. Because this waits for gathering, it will not resolve if no DataChannel, other
     * tracks or remote description have been provided beforehand.
     */
    async getLocalDescription(): Promise<RTCSessionDescriptionInit> {
        let setupChannel: NodeDataChannel.DataChannel | undefined;
        if (this.rawConn.gatheringState() === 'new') {
            // We can't create an offer until we have something to negotiate, but we don't want to
            // negotiate ourselves when we don't really know what's being negotiated here. To work
            // around that, we create a channel to trigger gathering & get an offer, and then we
            // remove it before the offer is delivered, so it's never visible remotely.
            setupChannel = this.rawConn.createDataChannel('mockrtc.setup-channel');
        }

        await new Promise<void>((resolve) => {
            this.rawConn.onGatheringStateChange((state) => {
                if (state === 'complete') resolve();
            });

            // Handle race conditions where gathering has already completed
            if (this.rawConn.gatheringState() === 'complete') resolve();
        });

        const sessionDescription = this.rawConn.localDescription() as RTCSessionDescriptionInit;
        setupChannel?.close();
        return sessionDescription;
    }

    async close() {
        if (this.rawConn.state() === 'closed') return;

        const closedPromise = new Promise<void>((resolve) => {
            this.rawConn.onStateChange((state) => {
                if (state === 'closed') resolve();
            });
        });

        this.rawConn.close();
        await closedPromise;
        this.emit('connection-closed');
    }

    proxyTrafficFrom(otherConnection: MockRTCPeerConnection) {
        otherConnection.channels.forEach((otherChannel: DataChannelStream) => {
            const mirrorChannel = this.rawConn.createDataChannel(otherChannel.label);
            const mirrorChannelStream = this.trackNewChannel(mirrorChannel, { isLocal: true });
            otherChannel.pipe(mirrorChannelStream).pipe(otherChannel);
        });

        otherConnection.addListener('local-channel-open', (otherChannel: DataChannelStream) => {
            const mirrorChannel = this.rawConn.createDataChannel(otherChannel.label);
            const mirrorChannelStream = this.trackNewChannel(mirrorChannel, { isLocal: true });
            otherChannel.pipe(mirrorChannelStream).pipe(otherChannel);
        });

        this.on('remote-channel-open', (incomingChannel: DataChannelStream) => {
            const otherChannel = otherConnection.createDataChannel(incomingChannel.label);
            incomingChannel.pipe(otherChannel).pipe(incomingChannel);
        });

        this.on('connection-closed', () => otherConnection.close());
        otherConnection.on('connection-closed', () => this.close());
    }

}