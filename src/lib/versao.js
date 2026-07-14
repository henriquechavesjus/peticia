import { createRequire } from 'node:module';

// createRequire em vez de "import ... with { type: 'json' }" para não emitir
// ExperimentalWarning no terminal do aluno.
const require = createRequire(import.meta.url);

export const VERSAO = require('../../package.json').version;
