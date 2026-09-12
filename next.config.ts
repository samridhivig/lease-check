import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'pdf-parse'],
  outputFileTracingExcludes: {
    '/api/translate': [
      './node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      './node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm/**',
      './node_modules/onnxruntime-web/**',
      'node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      'node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/arm/**',
      'node_modules/onnxruntime-web/**',
      'node_modules/@huggingface/transformers/.cache/**',
    ],
    '*': [
      './node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      './node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/arm/**',
      './node_modules/onnxruntime-web/**',
      'node_modules/onnxruntime-node/bin/napi-v6/win32/**',
      'node_modules/onnxruntime-node/bin/napi-v6/darwin/**',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/**',
      'node_modules/onnxruntime-node/bin/napi-v6/linux/arm/**',
      'node_modules/onnxruntime-web/**',
      'node_modules/@huggingface/transformers/.cache/**',
    ],
  },
};

export default config;
