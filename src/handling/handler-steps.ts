import { ClientServerChannel, Serializable } from 'mockttp/dist/util/serialization';
import type { DataChannelStream } from '../webrtc/datachannel-stream';
import { MockRTCPeerConnection } from '../webrtc/peer-connection';

export interface HandlerStep extends Serializable {
    readonly type: keyof typeof StepLookup;
    handle(connection: MockRTCPeerConnection): Promise<void>;
}

export class WaitStep extends Serializable implements HandlerStep {

    readonly type = 'wait-for-message';

    async handle(connection: MockRTCPeerConnection): Promise<void> {
        return new Promise<void>((resolve) => {
            const messageReceived = () => {
                connection.removeListener('channel-open', listenForMessage);
                connection.channels.forEach((channel) => {
                    channel.removeListener('data', messageReceived);
                    channel.pause();
                });

                resolve();
            };

            const listenForMessage = (channel: DataChannelStream) => {
                channel.once('data', messageReceived);
            }

            connection.on('channel-open', listenForMessage);
            connection.channels.forEach(listenForMessage);
        });
    }

}

export class SendStep extends Serializable implements HandlerStep {

    readonly type = 'send-all';

    constructor(
        private message: string | Buffer
    ) {
        super();
    }

    async handle({ channels }: MockRTCPeerConnection): Promise<void> {
        await Promise.all(
            channels.map((channel) => {
                return new Promise<void>((resolve, reject) => {
                    channel.write(this.message, (error: Error | null | undefined) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
            })
        );
    }

}

export class PeerProxyStep extends Serializable implements HandlerStep {

    readonly type = 'peer-proxy';

    private getAnswer: (offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>;

    private externalPeers: MockRTCPeerConnection[] = [];

    constructor(
        connectionTarget:
            | RTCPeerConnection
            | ((offer: RTCSessionDescriptionInit) => Promise<RTCSessionDescriptionInit>)
    ) {
        super();
        if (connectionTarget instanceof Function) {
            this.getAnswer = connectionTarget;
        } else {
            this.getAnswer = async (offer: RTCSessionDescriptionInit) => {
                await connectionTarget.setRemoteDescription(offer);
                const answer = await connectionTarget.createAnswer();
                await connectionTarget.setLocalDescription(answer);
                return answer;
            };
        }
    }

    async handle(connection: MockRTCPeerConnection) {
        const externalPeer = new MockRTCPeerConnection();
        this.externalPeers.push(externalPeer);

        const externalOffer = await externalPeer.getLocalDescription();
        externalPeer.setRemoteDescription(await this.getAnswer(externalOffer));

        externalPeer.proxyTrafficFrom(connection);

        // This step isn't 'done' unless the remote connection closes.
        return new Promise<void>((resolve) => {
            externalPeer.on('connection-closed', resolve);
        });
    }

    serialize(channel: ClientServerChannel): {} {
        channel.onRequest<
            { offer: RTCSessionDescriptionInit },
            { answer: RTCSessionDescriptionInit }
        >(async (msg) => {
            return { answer: await this.getAnswer(msg.offer) };
        });

        return { type: this.type };
    }

    static deserialize(_data: {}, channel: ClientServerChannel): PeerProxyStep {
        return new PeerProxyStep(async (offer: RTCSessionDescriptionInit) => {
            const response = await channel.request<
                { offer: RTCSessionDescriptionInit },
                { answer: RTCSessionDescriptionInit }
            >({ offer });
            return response.answer;
        });
    }

    dispose(): void {
        this.externalPeers.forEach(peer => peer.close());
    }

}

export const StepLookup = {
    'wait-for-message': WaitStep,
    'send-all': SendStep,
    'peer-proxy': PeerProxyStep
};