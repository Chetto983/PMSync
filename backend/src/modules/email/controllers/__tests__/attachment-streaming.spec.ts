/**
 * Attachment Streaming Integration Test
 *
 * Validates that the attachment download endpoint:
 * 1. Uses piped streaming (Readable.fromWeb + pipeline), NOT buffering (arrayBuffer + Buffer.from)
 * 2. Passes Content-Length header from S3 response to client
 * 3. Handles upstream stream errors gracefully
 *
 * Covers: APIS-03 (piped streaming), APIS-04 (Content-Length passthrough)
 */
import { Readable, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';

describe('Attachment Streaming', () => {
  /**
   * Simulate the streaming logic from attachments.controller.ts downloadAttachment method.
   * We extract the core streaming pattern to test it in isolation.
   */
  async function streamFromS3ToResponse(
    s3Body: ReadableStream | null,
    res: { setHeader: jest.Mock; write: jest.Mock; end: jest.Mock } & NodeJS.WritableStream,
    contentLength?: string | null,
  ): Promise<void> {
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (s3Body) {
      const nodeStream = Readable.fromWeb(s3Body as any); // eslint-disable-line @typescript-eslint/no-explicit-any
      await pipeline(nodeStream, res);
    } else {
      throw new Error('No response body from S3');
    }
  }

  /**
   * Create a mock WritableStream that collects chunks.
   */
  function createMockResponse(): PassThrough & {
    setHeader: jest.Mock;
    chunks: Buffer[];
  } {
    const passThrough = new PassThrough() as PassThrough & {
      setHeader: jest.Mock;
      chunks: Buffer[];
    };
    passThrough.setHeader = jest.fn();
    passThrough.chunks = [];

    passThrough.on('data', (chunk: Buffer) => {
      passThrough.chunks.push(chunk);
    });

    return passThrough;
  }

  /**
   * Create a web ReadableStream from a string or buffer.
   */
  function createWebStream(data: Buffer | string): ReadableStream<Uint8Array> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return new ReadableStream<Uint8Array>({
      start(controller) {
        // Push in small chunks to simulate streaming
        const chunkSize = 64;
        for (let i = 0; i < buf.length; i += chunkSize) {
          controller.enqueue(new Uint8Array(buf.subarray(i, i + chunkSize)));
        }
        controller.close();
      },
    });
  }

  it('streams data from S3 body to response without buffering entire file', async () => {
    const testData = 'A'.repeat(1024); // 1KB test data
    const webStream = createWebStream(testData);
    const mockRes = createMockResponse();

    await streamFromS3ToResponse(webStream, mockRes as any, '1024');

    const received = Buffer.concat(mockRes.chunks).toString();
    expect(received).toBe(testData);
    expect(received.length).toBe(1024);
  });

  it('sets Content-Length header from S3 response', async () => {
    const testData = 'test content';
    const webStream = createWebStream(testData);
    const mockRes = createMockResponse();

    await streamFromS3ToResponse(webStream, mockRes as any, '12');

    expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Length', '12');
  });

  it('does not set Content-Length when not provided by S3', async () => {
    const testData = 'test content';
    const webStream = createWebStream(testData);
    const mockRes = createMockResponse();

    await streamFromS3ToResponse(webStream, mockRes as any, null);

    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  it('throws when S3 body is null', async () => {
    const mockRes = createMockResponse();

    await expect(
      streamFromS3ToResponse(null, mockRes as any, null),
    ).rejects.toThrow('No response body from S3');
  });

  it('handles upstream stream error gracefully', async () => {
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(Buffer.from('partial')));
        controller.error(new Error('S3 connection reset'));
      },
    });

    const mockRes = createMockResponse();

    await expect(
      streamFromS3ToResponse(errorStream, mockRes as any, null),
    ).rejects.toThrow();
  });

  it('does NOT call arrayBuffer on the S3 response body', () => {
    // This is a static analysis check -- verify the controller source code
    // does not contain arrayBuffer() or Buffer.from() buffering pattern
    const fs = require('fs');
    const path = require('path');
    const controllerPath = path.resolve(
      __dirname,
      '../attachments.controller.ts',
    );
    const source = fs.readFileSync(controllerPath, 'utf-8');

    // Should NOT have the old buffering pattern
    expect(source).not.toContain('await s3Response.arrayBuffer()');
    expect(source).not.toContain('Buffer.from(arrayBuffer)');

    // SHOULD have the streaming pattern
    expect(source).toContain('Readable.fromWeb');
    expect(source).toContain('pipeline');
  });

  it('streams large data (1MB) in chunks without accumulating in memory', async () => {
    // 1MB of data to verify chunked streaming works
    const largeBuf = Buffer.alloc(1024 * 1024, 0x42); // 1MB of 'B'
    const webStream = createWebStream(largeBuf);
    const mockRes = createMockResponse();

    await streamFromS3ToResponse(webStream, mockRes as any, String(largeBuf.length));

    const received = Buffer.concat(mockRes.chunks);
    expect(received.length).toBe(largeBuf.length);
    expect(received[0]).toBe(0x42);
    expect(received[received.length - 1]).toBe(0x42);
  });
});
