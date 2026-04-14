import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-web', 'pdf-parse'],
};

export default config;
