// Preserve chronological speech through brief GPU stalls. Never silently drop a word.
export class ConversionQueue {
  constructor(convert, receive, failed, maxPending = 3) {
    this.convert = convert; this.receive = receive; this.failed = failed; this.maxPending = maxPending;
    this.pending = []; this.running = false; this.closed = false;
  }
  push(samples) {
    if (this.closed) return;
    if (this.pending.length >= this.maxPending) {
      this.close(); this.failed(new Error('A conversão não está acompanhando sua fala. Feche aplicativos pesados ou escolha Natural e ative novamente.')); return;
    }
    this.pending.push(samples); void this.drain();
  }
  async drain() {
    if (this.running || this.closed) return;
    this.running = true;
    try {
      while (!this.closed && this.pending.length) {
        const samples = this.pending.shift(); const result = await this.convert(samples);
        if (!this.closed) this.receive(result);
      }
    } catch (error) { if (!this.closed) { this.close(); this.failed(error); } }
    finally { this.running = false; }
  }
  close() { this.closed = true; this.pending.length = 0; }
}
