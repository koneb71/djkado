/// <reference types="@types/audioworklet" />

class BitcrusherProcessor extends AudioWorkletProcessor {
  private phase = 0;
  private held: number[] = [0, 0];

  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 1, maxValue: 16, automationRate: 'k-rate' as AutomationRate },
      { name: 'reduction', defaultValue: 1, minValue: 1, maxValue: 64, automationRate: 'k-rate' as AutomationRate },
    ];
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const bits = params.bits[0];
    const reduction = Math.max(1, Math.round(params.reduction[0]));
    const step = Math.pow(0.5, bits - 1);
    const frames = output[0].length;
    for (let i = 0; i < frames; i++) {
      this.phase++;
      const sampleNow = this.phase >= reduction;
      if (sampleNow) this.phase = 0;
      for (let c = 0; c < output.length; c++) {
        const inCh = input[c] ?? input[0];
        if (sampleNow) this.held[c] = step * Math.round(inCh[i] / step);
        output[c][i] = this.held[c] ?? 0;
      }
    }
    return true;
  }
}

registerProcessor('bitcrusher', BitcrusherProcessor);
