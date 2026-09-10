import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-web', 'pdf-parse'],
  outputFileTracingExcludes: {
    '*': [
      './node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      './node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm/**',
      'node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      'node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/arm/**',
    ],
  },
};

export default config;
