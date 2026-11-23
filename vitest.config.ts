import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Ejecuta los archivos de forma secuencial para evitar interferencias
    // sobre la misma base PostgreSQL de Docker.
    fileParallelism: false,
  },
});