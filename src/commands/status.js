import { coletarStatus } from '../lib/coletor-status.js';
import { formatarStatus } from '../lib/formatador-status.js';
import { info } from '../lib/ui.js';

/**
 * Comando informativo: sai 0 mesmo com avisos. Só falha (via NaoConfigurado,
 * tratado no cli.js) quando não há instalação nenhuma.
 */
export async function status({ sandbox = false, json = false } = {}) {
  const dados = await coletarStatus({ sandbox });

  if (json) {
    // Sem cor e sem nada sensível: a chave da OpenAI nunca entra no objeto.
    console.log(JSON.stringify(dados, null, 2));
    return dados;
  }

  info(formatarStatus(dados));
  return dados;
}
