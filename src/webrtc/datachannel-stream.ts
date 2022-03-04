import * as stream from 'stream';
import * as NodeDataChannel from 'node-datachannel';

/**
 * Turns a node-datachannel DataChannel into a real Node.js stream, complete with
 * buffering, backpressure (up to a point - if the buffer fills up, messages are dropped),
 * and support for piping data elsewhere.
 *
 * Read & written data may be either UTF-8 strings or Buffers - this difference exists at
 * the protocol level, and is preserved here.
 */
export class DataChannelStream extends stream.Duplex {

    constructor(
        private rawChannel: NodeDataChannel.DataChannel,
        streamOptions: {
            // These are the only Duplex options supported:
            readableHighWaterMark?: number | undefined;
            writableHighWaterMark?: number | undefined;
        } = {}
    ) {
        super({
            ...streamOptions,
            allowHalfOpen: false, // Not supported by WebRTC (AFAICT)
            decodeStrings: false // Preserve the string/buffer distinction (WebRTC treats them differently)
        });

        rawChannel.onMessage((msg) => {
            if (!this._readActive) return; // If the buffer is full, drop messages.

            // If the push is rejected, we pause reading until the next call to _read().
            this._readActive = this.push(msg);
        });

        // When the DataChannel closes, the readable & writable ends close
        rawChannel.onClosed(() => {
            this.push(null);
            this.destroy();
        });

        rawChannel.onError((errMsg) => {
            this.destroy(new Error(`DataChannel error: ${errMsg}`));
        });

        // Buffer all writes until the DataChannel opens
        if (!rawChannel.isOpen()) {
            this.cork();
            rawChannel.onOpen(() => this.uncork());
        }
    }

    private _readActive = true;
    _read() {
        // Stop dropping messages, if the buffer filling up meant we were doing so before.
        this._readActive = true;
    }

    _write(chunk: string | Buffer, encoding: string, callback: (error: Error | null) => void) {
        // The underlying source only deals with strings.
        const sentOk = (Buffer.isBuffer(chunk))
            ? this.rawChannel.sendMessageBinary(chunk)
            : this.rawChannel.sendMessage(chunk);

        if (sentOk) {
            callback(null);
        } else {
            callback(new Error("Failed to write to DataChannel"));
        }
    }

    _final() {
        // When the writable end finishes, we close the DataChannel.
        this.rawChannel.close();
    }

}